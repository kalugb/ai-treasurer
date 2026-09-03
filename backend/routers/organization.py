from fastapi import APIRouter, Request, Depends
from pymongo import MongoClient

from services.mongodb import mongodb_ops

from models.organization import CreateOrganizationRequest, UpdateOrganizationRequest

router = APIRouter(prefix="/api")

def get_mongo(request: Request):
    return request.app.state.mongo

@router.get("/organizations")
def get_organization(mongo: MongoClient = Depends(get_mongo)):
    pass

@router.post("/organizations")
def create_organization(payload: CreateOrganizationRequest, mongo: MongoClient = Depends(get_mongo)):
    pass

@router.put("/organizations/{org_id}")
def update_organization(org_id: str, payload: UpdateOrganizationRequest, mongo: MongoClient = Depends(get_mongo)):
    pass

@router.delete("/organizations/{org_id}")
def delete_organization(org_id: str, mongo: MongoClient = Depends(get_mongo)):
    pass