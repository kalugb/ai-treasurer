"""Users: main DB (`treasurer`), collection `users`, one document per person.

- `authId`: the Supabase Auth user id (JWT `sub`). The only link between a login and this document.
- `userKey`: the string id organizations.ownerId stores. New accounts: str(_id). The first account takes over the
  pre-auth user "1" and keeps its key "1" (so its orgs, receipts and chats stay its own).
- `username`: unique, lowercase, used to sign in. `displayName` defaults to it.
- `_id`: the ObjectId the `ai` / `history` databases store as `userId` (same mapping as services.ai.history.user_oid).
- `googleDrive`: zero or one Drive connection; `tokenEnc` is the Fernet-encrypted OAuth token and never leaves the server.

`get_current_user` is the ONLY place a request becomes a user: it reads the httpOnly session cookie and nothing else.
"""
import os
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import Depends, HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from services import auth
from services.ai.history import user_oid

USER_COLLECTION = "users"
DEFAULT_USER_KEY = "1"
CURRENCIES = ("MYR", "USD", "CAD", "GBP")
DEFAULT_SETTINGS = {"currency": "MYR", "monthlySummaries": True, "reviewReminders": True}
USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")


def ensure_indexes(db) -> None:
    col = db[USER_COLLECTION]
    col.create_index("userKey", unique=True, name="uniq_userKey")
    # only real emails are unique; users without one (email missing) are not indexed
    col.create_index("email", unique=True, name="uniq_email", partialFilterExpression={"email": {"$type": "string"}})
    # a doc without a login (the pre-auth user before it is claimed) has neither
    col.create_index("authId", unique=True, name="uniq_authId", partialFilterExpression={"authId": {"$type": "string"}})
    col.create_index("username", unique=True, name="uniq_username", partialFilterExpression={"username": {"$type": "string"}})


def _new_user(key: str, now: datetime) -> dict:
    return {
        "_id": user_oid(key),
        "displayName": "",
        "status": "active",
        "settings": dict(DEFAULT_SETTINGS),
        "googleDrive": None,
        "createdAt": now,
    }


def get_or_create(db, key: str) -> dict:
    """Blocking. Fetch the user, creating it with defaults on first sight (what a first login would do)."""
    col = db[USER_COLLECTION]
    now = datetime.now(timezone.utc)
    try:
        return col.find_one_and_update(
            {"userKey": key},
            {"$setOnInsert": {**_new_user(key, now), "userKey": key}, "$set": {"lastSeenAt": now}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:  # two first requests raced; the other one created it
        return col.find_one({"userKey": key})


def find_by_auth_id(db, auth_id: str) -> dict | None:
    return db[USER_COLLECTION].find_one({"authId": auth_id})


def find_by_username(db, username: str) -> dict | None:
    return db[USER_COLLECTION].find_one({"username": username})


def _claim_legacy_user(db, auth_id: str, username: str, email: str, display_name: str, provider: str, now: datetime) -> dict | None:
    """The first account takes over the pre-auth user "1": same _id and userKey, so every org, receipt, chat and the
    Drive connection it already has stay reachable. Atomic: only a doc without an authId can be claimed, once.
    Turn off with CLAIM_LEGACY_USER=false (new deployments have nothing to claim)."""
    if (os.getenv("CLAIM_LEGACY_USER") or "true").strip().lower() != "true":
        return None
    get_or_create(db, DEFAULT_USER_KEY)
    return db[USER_COLLECTION].find_one_and_update(
        {"userKey": DEFAULT_USER_KEY, "authId": {"$exists": False}},
        [{"$set": {
            "authId": auth_id, "username": username, "email": email, "authProvider": provider,
            "displayName": {"$cond": [{"$gt": [{"$strLenCP": {"$ifNull": ["$displayName", ""]}}, 0]}, "$displayName", display_name]},
            "updatedAt": now, "lastSeenAt": now,
        }}],
        return_document=ReturnDocument.AFTER,
    )


def create_account(db, *, auth_id: str, username: str, email: str, display_name: str | None, provider: str) -> dict:
    """Blocking. Insert the profile for a new login. Raises DuplicateKeyError when the username/email/authId is taken."""
    now = datetime.now(timezone.utc)
    display_name = (display_name or "").strip() or username
    claimed = _claim_legacy_user(db, auth_id, username, email, display_name, provider, now)
    if claimed:
        return claimed
    oid = ObjectId()
    doc = {
        "_id": oid, "userKey": str(oid), "authId": auth_id, "authProvider": provider, "username": username,
        "displayName": display_name, "email": email, "status": "active", "settings": dict(DEFAULT_SETTINGS),
        "googleDrive": None, "createdAt": now, "lastSeenAt": now,
    }
    db[USER_COLLECTION].insert_one(doc)
    return doc


def unique_username(db, seed: str) -> str:
    """Blocking. A free username derived from an email or name (Google sign-in has none to ask for)."""
    base = re.sub(r"[^a-z0-9_.]", "", seed.split("@")[0].lower())[:24].ljust(3, "0")
    candidate, n = base, 0
    while find_by_username(db, candidate):
        n += 1
        candidate = f"{base[:24]}{n}"
    return candidate


def ensure_account(db, auth_user: dict, provider: str) -> dict:
    """Blocking. The profile for a Supabase user (as returned in a session), created on first sight.
    A disabled profile is returned as is; the caller decides."""
    auth_id, email = auth_user["id"], (auth_user.get("email") or "").lower()
    meta = auth_user.get("user_metadata") or {}
    doc = find_by_auth_id(db, auth_id)
    if doc is None:
        username = meta.get("username") or unique_username(db, email or meta.get("name") or "user")
        try:
            doc = create_account(db, auth_id=auth_id, username=username, email=email,
                                 display_name=meta.get("full_name") or meta.get("name"), provider=provider)
        except DuplicateKeyError:  # two requests raced; or a real conflict, then find_by_auth_id stays None
            doc = find_by_auth_id(db, auth_id)
            if doc is None:
                raise
    db[USER_COLLECTION].update_one({"_id": doc["_id"]}, {"$set": {"lastSeenAt": datetime.now(timezone.utc)}})
    return doc


def drive_status(doc: dict) -> dict:
    drive = doc.get("googleDrive") or {}
    return {
        "connected": bool(drive.get("connected") and drive.get("tokenEnc")),
        "accountEmail": drive.get("accountEmail"),
        "connectedAt": drive.get("connectedAt"),
    }


def public(doc: dict) -> dict:
    """API shape of a user. Never includes the token."""
    return {
        "id": str(doc["_id"]),
        "userKey": doc.get("userKey"),
        "username": doc.get("username"),
        "authProvider": doc.get("authProvider"),
        "displayName": doc.get("displayName") or "",
        "email": doc.get("email"),
        "status": doc.get("status", "active"),
        "settings": {**DEFAULT_SETTINGS, **(doc.get("settings") or {})},
        "googleDrive": drive_status(doc),
        "createdAt": doc.get("createdAt"),
        "updatedAt": doc.get("updatedAt"),
    }


async def get_current_user(request: Request) -> dict:
    """The signed-in user, from the httpOnly session cookie. 401 without a valid session, 403 for a disabled account."""
    token = request.cookies.get(auth.ACCESS_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    claims = auth.verify_token(token)
    db = request.app.state.mongo
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    user = await run_in_threadpool(find_by_auth_id, db, claims["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="This account is disabled")
    request.state.claims = claims
    request.state.user = user
    return user


async def current_owner_id(user: dict = Depends(get_current_user)) -> str:
    """The signed-in user's key, to use wherever a route used to take a client-sent ownerId/userId."""
    return user["userKey"]
