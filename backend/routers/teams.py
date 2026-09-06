from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Depends, Response

from services.mongodb import mongodb_ops
from services.redis.cache import CacheStore
from models.team import CreateTeamRequest, UpdateTeamRequest

router = APIRouter(prefix="/api")
COLLECTION_NAME = "departments"
ORG_COLLECTION = "organizations"
CACHE_KEY_NAME = "departments"

def get_mongo(request: Request):
    return request.app.state.mongo

def get_cache_redis(request: Request):
    return request.app.state.cache

def _parse_id(raw: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")

def _to_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name") or doc.get("team_name") or "",
        "orgId": str(doc["orgId"]) if isinstance(doc.get("orgId"), ObjectId) else str(doc.get("orgId", "")),
        "orgName": doc.get("orgName", ""),
        "createdAt": doc.get("createdAt"),
        "budget": doc.get("budget", 0) or 0,
        "used": doc.get("used", 0) or 0,
        "members": doc.get("members", []) or [],
    }

async def _verify_org_owner(mongo, org_id: ObjectId, owner_id: str | None):
    # if ownerId provided, ensure organization belongs to that owner
    if not owner_id:
        return
    org = await mongodb_ops.read(mongo, collection_name=ORG_COLLECTION, query={"_id": org_id})
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    org_owner = org.get("ownerId", org.get("owner_id", org.get("ownerID")))
    if org_owner != owner_id:
        raise HTTPException(status_code=403, detail="Not authorized for this organization")

@router.get("/teams")
async def get_teams(orgId: str | None = None, ownerId: str | None = None, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    if not orgId:
        return []
    org_oid = _parse_id(orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    cache_key = cache.key_builder(str(org_oid), CACHE_KEY_NAME)
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached
    docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": org_oid}, read_many=True)
    # also support legacy string orgId
    if not docs:
        docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": orgId}, read_many=True)
    result = [_to_out(d) for d in (docs or [])]
    await cache.set(cache_key, result)
    return result

@router.post("/teams", status_code=201)
async def create_team(payload: CreateTeamRequest, ownerId: str | None = None, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    # ownerId may come from query param ?ownerId= or from payload ownerId alias
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    org_oid = _parse_id(payload.org_id, "orgId")
    owner = payload.org_owner_id or ownerId
    await _verify_org_owner(mongo, org_oid, owner)
    name = payload.team_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Team name cannot be empty")
    # unique per org
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": org_oid, "name": name}, read_many=True)
    if existing:
        raise HTTPException(status_code=409, detail="Team name already exists")
    # legacy check if old docs stored orgId as string
    if not existing:
        existing2 = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": str(org_oid), "name": name}, read_many=True)
        if existing2:
            raise HTTPException(status_code=409, detail="Team name already exists")
    # fetch orgName for denormalization
    org_doc = await mongodb_ops.read(mongo, collection_name=ORG_COLLECTION, query={"_id": org_oid})
    if org_doc is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    org_name = org_doc.get("orgName", org_doc.get("org_name", ""))
    doc = {
        "name": name,
        "orgId": org_oid,
        "orgName": org_name,
        "createdAt": datetime.now(timezone.utc),
        "budget": payload.budget if payload.budget is not None else 0,
        "used": 0,
        "members": [m.model_dump() for m in (payload.members or [])],
    }
    inserted = await mongodb_ops.create(mongo, doc_to_create=doc, collection_name=COLLECTION_NAME)
    doc["_id"] = inserted
    await cache.delete(cache.key_builder(str(org_oid), CACHE_KEY_NAME))
    return _to_out(doc)

@router.put("/teams/{team_id}")
async def update_team(team_id: str, payload: UpdateTeamRequest, orgId: str | None = None, ownerId: str | None = None, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    team_oid = _parse_id(team_id, "team id")
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": team_oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Team not found")
    # orgId safety: team belongs to which org
    team_org_id = existing.get("orgId")
    team_org_str = str(team_org_id) if isinstance(team_org_id, ObjectId) else str(team_org_id)
    # if caller passes orgId, ensure matches
    if orgId and str(_parse_id(orgId, "orgId")) != team_org_str and orgId != team_org_str:
        raise HTTPException(status_code=403, detail="Team does not belong to this organization")
    # verify owner
    await _verify_org_owner(mongo, team_org_id if isinstance(team_org_id, ObjectId) else _parse_id(team_org_str, "orgId"), ownerId or existing.get("ownerId"))
    update_data: dict = {}
    if payload.team_name is not None:
        new_name = payload.team_name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Team name cannot be empty")
        # dup check within same org
        dup = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": team_org_id, "name": new_name, "_id": {"$ne": team_oid}}, read_many=True)
        if dup:
            raise HTTPException(status_code=409, detail="Team name already exists")
        update_data["name"] = new_name
    if payload.budget is not None:
        if payload.budget < 0:
            raise HTTPException(status_code=400, detail="Budget cannot be negative")
        update_data["budget"] = float(payload.budget)
    if payload.members is not None:
        update_data["members"] = [m.model_dump() if hasattr(m, "model_dump") else m for m in payload.members]
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    await mongodb_ops.update(mongo, query={"_id": team_oid}, collection_name=COLLECTION_NAME, update_data=update_data)
    await cache.delete(cache.key_builder(team_org_str, CACHE_KEY_NAME))
    updated = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": team_oid})
    return _to_out(updated)

@router.delete("/teams/{team_id}", status_code=204)
async def delete_team(team_id: str, orgId: str | None = None, ownerId: str | None = None, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    team_oid = _parse_id(team_id, "team id")
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": team_oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Team not found")
    team_org_id = existing.get("orgId")
    team_org_str = str(team_org_id) if isinstance(team_org_id, ObjectId) else str(team_org_id)
    if orgId and str(_parse_id(orgId, "orgId")) != team_org_str and orgId != team_org_str:
        raise HTTPException(status_code=403, detail="Team does not belong to this organization")
    await _verify_org_owner(mongo, team_org_id if isinstance(team_org_id, ObjectId) else _parse_id(team_org_str, "orgId"), ownerId)
    await mongodb_ops.delete(mongo, collection_name=COLLECTION_NAME, query={"_id": team_oid})
    await cache.delete(cache.key_builder(team_org_str, CACHE_KEY_NAME))
    return Response(status_code=204)
