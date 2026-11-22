"""The current user's profile, settings and Google Drive connection. Identity comes only from get_current_user."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from models.user import UserUpdate
from services import users
from services.google import drive_tokens, google_connect

router = APIRouter(prefix="/api/users")


@router.get("/me")
async def get_me(user: dict = Depends(users.get_current_user)):
    return users.public(user)


@router.patch("/me")
async def update_me(payload: UserUpdate, request: Request, user: dict = Depends(users.get_current_user)):
    data = payload.model_dump(exclude_unset=True)
    set_fields, unset_fields = {}, {}
    if data.get("displayName") is not None:
        set_fields["displayName"] = data["displayName"].strip()
    if "email" in data and data["email"] is not None:
        email = data["email"].strip().lower()
        if email:
            set_fields["email"] = email
        else:
            unset_fields["email"] = ""
    for key, value in (data.get("settings") or {}).items():
        if value is not None:
            set_fields[f"settings.{key}"] = value
    if not set_fields and not unset_fields:
        raise HTTPException(status_code=400, detail="Nothing to update")

    update = {"$set": {**set_fields, "updatedAt": datetime.now(timezone.utc)}}
    if unset_fields:
        update["$unset"] = unset_fields
    col = request.app.state.mongo[users.USER_COLLECTION]
    try:
        doc = await run_in_threadpool(col.find_one_and_update, {"_id": user["_id"]}, update, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="That email is already used by another account.")
    return users.public(doc)


@router.get("/me/google-drive")
async def get_drive_status(user: dict = Depends(users.get_current_user)):
    return users.drive_status(user)


@router.post("/me/google-drive/connect")
async def connect_drive(user: dict = Depends(users.get_current_user)):
    """Returns the Google consent URL; the browser goes there and Google redirects to /api/connect/google/callback."""
    try:
        return {"authUrl": google_connect.authorization_url(user["userKey"])}
    except RuntimeError as e:
        print(f"Google connect unavailable: {e}")
        raise HTTPException(status_code=503, detail="Google Drive connect is not configured on the server.")


@router.delete("/me/google-drive")
async def disconnect_drive(request: Request, user: dict = Depends(users.get_current_user)):
    await run_in_threadpool(drive_tokens.disconnect, request.app.state.mongo, user["userKey"])
    return {"connected": False, "accountEmail": None, "connectedAt": None}
