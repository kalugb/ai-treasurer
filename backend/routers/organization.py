from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Depends, Response

from services.mongodb import mongodb_ops
from services.redis.cache import CacheStore

from models.organization import CreateOrganizationRequest, UpdateOrganizationRequest

router = APIRouter(prefix="/api")
COLLECTION_NAME = "organizations"
CACHE_KEY_NAME = "organizations"

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
    await cache.delete(cache.key_builder(owner_id_val, CACHE_KEY_NAME))
    updated = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    return _to_out(updated)

@router.delete("/organizations/{org_id}", status_code=204)
async def delete_organization(org_id: str, mongo=Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    oid = _parse_id(org_id)
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    owner_id_val = existing.get("ownerId", existing.get("owner_id", existing.get("ownerID")))
    await mongodb_ops.delete(mongo, collection_name=COLLECTION_NAME, query={"_id": oid})
    await cache.delete(cache.key_builder(owner_id_val, CACHE_KEY_NAME))
    return Response(status_code=204)
