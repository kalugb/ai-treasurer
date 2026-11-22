"""Users: main DB (`treasurer`), collection `users`, one document per person.

- `userKey`: the string id organizations.ownerId stores (pre-auth placeholder "1"; later the auth provider's subject id).
- `_id`: the ObjectId the `ai` / `history` databases store as `userId` (same mapping as services.ai.history.user_oid).
- `googleDrive`: zero or one Drive connection; `tokenEnc` is the Fernet-encrypted OAuth token and never leaves the server.

`get_current_user` is the ONLY place a request becomes a user. When login lands, change just that function.
"""
from datetime import datetime, timezone

from fastapi import HTTPException, Query, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from services.ai.history import user_oid

USER_COLLECTION = "users"
DEFAULT_USER_KEY = "1"
CURRENCIES = ("MYR", "USD", "CAD", "GBP")
DEFAULT_SETTINGS = {"currency": "MYR", "monthlySummaries": True, "reviewReminders": True}


def ensure_indexes(db) -> None:
    col = db[USER_COLLECTION]
    col.create_index("userKey", unique=True, name="uniq_userKey")
    # only real emails are unique; users without one (email missing) are not indexed
    col.create_index("email", unique=True, name="uniq_email", partialFilterExpression={"email": {"$type": "string"}})


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
        "displayName": doc.get("displayName") or "",
        "email": doc.get("email"),
        "status": doc.get("status", "active"),
        "settings": {**DEFAULT_SETTINGS, **(doc.get("settings") or {})},
        "googleDrive": drive_status(doc),
        "createdAt": doc.get("createdAt"),
        "updatedAt": doc.get("updatedAt"),
    }


async def get_current_user(request: Request, userId: str = Query(DEFAULT_USER_KEY, min_length=1, max_length=64)) -> dict:
    # shortcut: trusts the client-sent userId (no login yet); replace with session/token validation when auth lands
    db = request.app.state.mongo
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    user = await run_in_threadpool(get_or_create, db, userId)
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="This account is disabled")
    return user
