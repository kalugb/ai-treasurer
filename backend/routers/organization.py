from fastapi import APIRouter, HTTPException, Request, Depends
from pymongo import MongoClient

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

@router.get("/organizations")
async def get_organization(ownerId: str, mongo: MongoClient = Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    # check cache first, if not, query the db then save to cache
    cache_key = cache.key_builder(ownerId, CACHE_KEY_NAME)
    cached_data = await cache.get(cache_key)
    if cached_data is not None:
        cached_data.append({"source": "cache"})
        return cached_data

    # If not in cache, query the database
    query = { "ownerID": ownerId }
    projection = { "_id": 0 }  # Exclude the _id field from the result
    organization = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query=query, projection=projection, read_many=True)
    if organization is None or len(organization) == 0:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Save to cache
    await cache.set(cache_key, organization)
    
    organization.append({"source": "database"})
    return organization

@router.post("/organizations")
async def create_organization(payload: CreateOrganizationRequest, mongo: MongoClient = Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    pass

@router.put("/organizations/{org_id}")
async def update_organization(org_id: str, payload: UpdateOrganizationRequest, mongo: MongoClient = Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    pass

@router.delete("/organizations/{org_id}")
async def delete_organization(org_id: str, mongo: MongoClient = Depends(get_mongo), cache: CacheStore = Depends(get_cache_redis)):
    pass