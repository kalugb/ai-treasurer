from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Depends, Response
from starlette.concurrency import run_in_threadpool

from services.mongodb import mongodb_ops
from services.redis.cache import CacheStore
from services.supabase import supabase_ops
from routers.teams import (
    RECEIPTS_CACHE_KEY_NAME,
    RECEIPTS_COLLECTION,
    REIMBURSEMENT_COLLECTION,
    CASHIN_COLLECTION,
    COLLECTION_NAME as TEAMS_COLLECTION,
    _verify_org_owner,
)

from models.organization import CreateOrganizationRequest, UpdateOrganizationRequest

router = APIRouter(prefix="/api")
COLLECTION_NAME = "organizations"
SNAPSHOTS_COLLECTION = "snapshots"
CACHE_KEY_NAME = "organizations"
UNLINKED_TEAM_CACHE_KEY = "teams"

def get_mongo(request: Request):
    return request.app.state.mongo

def get_cache_redis(request: Request):
    return request.app.state.cache

def _to_out(doc: dict) -> dict:
    # mongo stores camelCase (orgName/ownerId/createdAt) — support snake fallback for legacy
    return {
        "id": str(doc["_id"]),
        "orgName": doc.get("orgName", doc.get("org_name")),
        "ownerId": doc.get("ownerId", doc.get("owner_id", doc.get("ownerID"))),
        "createdAt": doc.get("createdAt", doc.get("created_at")),
    }

def _parse_id(org_id: str) -> ObjectId:
    try:
        return ObjectId(org_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail="Invalid organization id")

@router.get("/organizations")
async def get_organization(ownerId: str, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    cache_key = cache.key_builder(ownerId, CACHE_KEY_NAME)
    cached_data = await cache.get(cache_key)
    if cached_data is not None:
        return cached_data

    # mongo uses camelCase ownerId
    query = {"ownerId": ownerId}
    docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query=query, read_many=True)
    if not docs:
        # fallback for legacy snake/ownerID docs
        for fallback in [{"owner_id": ownerId}, {"ownerID": ownerId}]:
            docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query=fallback, read_many=True)
            if docs:
                break
    if not docs:
        raise HTTPException(status_code=404, detail="Organization not found")

    result = [_to_out(d) for d in docs]
    await cache.set(cache_key, result)
    return result

@router.post("/organizations", status_code=201)
async def create_organization(payload: CreateOrganizationRequest, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    org_name = payload.org_name.strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="Organization name cannot be empty")
    # duplicate check (exact match) — mongo uses camelCase
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"ownerId": payload.owner_id, "orgName": org_name}, read_many=True)
    if existing:
        raise HTTPException(status_code=409, detail="Organization name already exists")
    doc = {"orgName": org_name, "ownerId": payload.owner_id, "createdAt": datetime.now(timezone.utc)}
    inserted_id = await mongodb_ops.create(mongo, doc_to_create=doc, collection_name=COLLECTION_NAME)
    doc["_id"] = inserted_id
    await cache.delete(cache.key_builder(payload.owner_id, CACHE_KEY_NAME))
    return _to_out(doc)

@router.put("/organizations/{org_id}")
async def update_organization(org_id: str, payload: UpdateOrganizationRequest, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    oid = _parse_id(org_id)
    org_name = payload.org_name.strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="Organization name cannot be empty")
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    owner_id_val = existing.get("ownerId", existing.get("owner_id", existing.get("ownerID")))
    # duplicate check within same owner — camelCase
    dup = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"ownerId": owner_id_val, "orgName": org_name, "_id": {"$ne": oid}})
    if dup:
        raise HTTPException(status_code=409, detail="Organization name already exists")
    await mongodb_ops.update(mongo, query={"_id": oid}, collection_name=COLLECTION_NAME, update_data={"orgName": org_name})
    # fan-out orgName to teams
    await mongodb_ops.update(mongo, query={"orgId": oid}, collection_name="teams", update_data={"orgName": org_name}, update_many=True)
    # also handle legacy string orgId
    await mongodb_ops.update(mongo, query={"orgId": org_id}, collection_name="teams", update_data={"orgName": org_name}, update_many=True)
    await cache.delete(cache.key_builder(owner_id_val, CACHE_KEY_NAME))
    await cache.delete(cache.key_builder(str(oid), "teams"))
    updated = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    return _to_out(updated)

def _cascade_queries(oid: ObjectId, org_id: str, team_oids: list[ObjectId]) -> list[tuple[str, dict]]:
    """Org delete removes receipts + reimbursement + cash in records + teams before the org doc.
    Ids are stored as ObjectId by new code and as strings by legacy docs, so match both."""
    org_forms = [oid, org_id]
    return [
        (RECEIPTS_COLLECTION, {"$or": [{"departmentID": {"$in": team_oids}}, {"orgID": {"$in": org_forms}}]}),
        (REIMBURSEMENT_COLLECTION, {"$or": [{"teamInvolvedId": {"$in": team_oids}}, {"orgId": {"$in": org_forms}}]}),
        (CASHIN_COLLECTION, {"orgId": {"$in": org_forms}}),
        (TEAMS_COLLECTION, {"orgId": {"$in": org_forms}}),
        (COLLECTION_NAME, {"_id": oid}),
    ]


async def _cascade_scopes(mongo, oid: ObjectId, org_id: str):
    """Reads exactly what _cascade_queries would delete (for the impact preview + file cleanup)."""
    teams = await mongodb_ops.read(mongo, collection_name=TEAMS_COLLECTION, query={"orgId": {"$in": [oid, org_id]}}, read_many=True)
    team_oids = [team["_id"] for team in teams or []]
    receipts, records = [], []
    for name, query in _cascade_queries(oid, org_id, team_oids):
        if name == RECEIPTS_COLLECTION:
            receipts = await mongodb_ops.read(mongo, collection_name=name, query=query, read_many=True) or []
        elif name == REIMBURSEMENT_COLLECTION:
            records = await mongodb_ops.read(mongo, collection_name=name, query=query, read_many=True) or []
    return team_oids, receipts, records


async def _org_cashins(mongo, oid: ObjectId, org_id: str) -> list[dict]:
    return await mongodb_ops.read(mongo, collection_name=CASHIN_COLLECTION, query={"orgId": {"$in": [oid, org_id]}}, read_many=True) or []


@router.get("/organizations/{org_id}/delete-impact")
async def organization_delete_impact(org_id: str, request: Request, ownerId: str | None = None, mongo=Depends(get_mongo)):
    """What deleting this organization would permanently destroy (shown in the confirmation dialog)."""
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    oid = _parse_id(org_id)
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    await _verify_org_owner(mongo, oid, ownerId)
    team_oids, receipts, records = await _cascade_scopes(mongo, oid, org_id)
    paid = [record.get("amount") or 0.0 for record in records if record.get("status") == "Reimbursed"]
    history = request.app.state.history_mongo
    return {
        "teams": len(team_oids),
        "receipts": len(receipts),
        "records": len(records),
        "reimbursedRecords": len(paid),
        "reimbursedAmount": round(sum(paid), 2),
        "cashIns": len(await _org_cashins(mongo, oid, org_id)),
        "snapshots": history[SNAPSHOTS_COLLECTION].count_documents({"orgId": oid}) if history is not None else 0,
    }


@router.delete("/organizations/{org_id}", status_code=204)
async def delete_organization(org_id: str, request: Request, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    oid = _parse_id(org_id)
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    owner_id_val = existing.get("ownerId", existing.get("owner_id", existing.get("ownerID")))
    team_oids, receipts, _ = await _cascade_scopes(mongo, oid, org_id)
    cashins = await _org_cashins(mongo, oid, org_id)
    # shortcut: sequential deletes, not a transaction (org delete was already non-transactional before
    # receipts/reimbursements were included) — a mid-run failure can leave partial deletes.
    for name, query in _cascade_queries(oid, org_id, team_oids):
        await mongodb_ops.delete(mongo, collection_name=name, query=query, delete_many=True)
    # the org's snapshots go with it (best-effort: a different DB, so not part of the cascade above)
    history = request.app.state.history_mongo
    if history is not None:
        try:
            history[SNAPSHOTS_COLLECTION].delete_many({"orgId": oid})
        except Exception:
            pass
    # committed: now clean up what the DB can't cover (storage files, caches). Best-effort.
    for receipt in receipts:
        storage_path = receipt.get("storagePath")
        if storage_path:
            try:
                await run_in_threadpool(supabase_ops.delete_receipt, storage_path)
            except Exception:
                pass
            await cache.delete(cache.key_builder(str(receipt["_id"]), f"thumb:{storage_path}"))
    for cashin in cashins:  # proof images of the deleted cash in records
        image_path = (cashin.get("imageMetadata") or {}).get("storagePath")
        if image_path:
            try:
                await run_in_threadpool(supabase_ops.delete_cashin_image, image_path)
            except Exception:
                pass
    for team_oid in team_oids:
        await cache.delete(cache.key_builder(str(team_oid), RECEIPTS_CACHE_KEY_NAME))
    await cache.delete(cache.key_builder(owner_id_val, CACHE_KEY_NAME))
    await cache.delete(cache.key_builder(str(oid), UNLINKED_TEAM_CACHE_KEY))
    return Response(status_code=204)
