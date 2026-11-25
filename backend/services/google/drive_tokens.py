"""Per-user Google Drive access, built from the encrypted token stored on the user (treasurer.users.googleDrive).

Team routes use the org OWNER's connection (`run_for_org`); the agent's Drive tools use the chatting user's.
"""
import json
import threading
from datetime import datetime, timezone

import requests
from bson import ObjectId
from fastapi import HTTPException, Request
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from starlette.concurrency import run_in_threadpool

from services import crypto, users
from services.google.google_connect import LEGACY_TOKEN_FILE, SCOPES, account_email
from services.google.google_ops import GoogleDriveService

ORG_COLLECTION = "organizations"
NOT_CONNECTED = "The organization owner hasn't connected Google Drive. Connect it in Settings."
RECONNECT = "Google Drive access expired or was revoked. The organization owner needs to reconnect Google Drive in Settings."

# shortcut: per-process cache, fine for one uvicorn worker; with several, a disconnect only clears its own worker
_services: dict[str, GoogleDriveService] = {}
_lock = threading.Lock()


class DriveNotConnected(Exception):
    pass


def forget(user_key: str) -> None:
    with _lock:
        _services.pop(user_key, None)


def save_connection(db, user_key: str, creds_json: str, email: str | None, extra: dict | None = None) -> None:
    """Blocking. Replace the user's connection (a user has zero or one)."""
    now = datetime.now(timezone.utc)
    users.get_or_create(db, user_key)
    db[users.USER_COLLECTION].update_one({"userKey": user_key}, {"$set": {
        "googleDrive": {
            "connected": True,
            "accountEmail": email,
            "scopes": SCOPES,
            "connectedAt": now,
            "tokenEnc": crypto.encrypt(creds_json),
        },
        "updatedAt": now,
        **(extra or {}),
    }})
    forget(user_key)


def mark_disconnected(db, user_key: str) -> None:
    """Blocking. Google rejected the token: drop it, keep the account email so the UI can say who to reconnect."""
    db[users.USER_COLLECTION].update_one(
        {"userKey": user_key},
        {"$set": {"googleDrive.connected": False, "updatedAt": datetime.now(timezone.utc)}, "$unset": {"googleDrive.tokenEnc": ""}},
    )
    forget(user_key)


def disconnect(db, user_key: str) -> None:
    """Blocking. Revoke at Google (best effort) and remove the connection."""
    doc = db[users.USER_COLLECTION].find_one({"userKey": user_key}, {"googleDrive": 1}) or {}
    enc = (doc.get("googleDrive") or {}).get("tokenEnc")
    if enc:
        try:
            info = json.loads(crypto.decrypt(enc))
            token = info.get("refresh_token") or info.get("token")
            requests.post("https://oauth2.googleapis.com/revoke", params={"token": token}, timeout=5)
        except Exception as e:
            print(f"Could not revoke the Google token: {type(e).__name__}")
    db[users.USER_COLLECTION].update_one(
        {"userKey": user_key}, {"$set": {"googleDrive": None, "updatedAt": datetime.now(timezone.utc)}}
    )
    forget(user_key)


def service_for_user(db, user_key: str) -> GoogleDriveService:
    """Blocking. Raises DriveNotConnected, InvalidToken (key changed) or RefreshError (token revoked)."""
    with _lock:
        cached = _services.get(user_key)
    if cached:
        return cached
    doc = db[users.USER_COLLECTION].find_one({"userKey": user_key}, {"googleDrive": 1}) or {}
    drive = doc.get("googleDrive") or {}
    if not (drive.get("connected") and drive.get("tokenEnc")):
        raise DriveNotConnected()
    creds = Credentials.from_authorized_user_info(json.loads(crypto.decrypt(drive["tokenEnc"])), SCOPES)
    if not creds.valid:
        creds.refresh(GoogleRequest())
    service = GoogleDriveService(build("drive", "v3", credentials=creds, cache_discovery=False))
    with _lock:
        _services[user_key] = service
    return service


def org_owner_key(db, org_id) -> str:
    """Blocking. ownerId of the organization (the userKey whose Drive the org's teams use)."""
    try:
        org_oid = org_id if isinstance(org_id, ObjectId) else ObjectId(str(org_id))
    except Exception:
        raise DriveNotConnected()
    org = db[ORG_COLLECTION].find_one({"_id": org_oid}, {"ownerId": 1, "owner_id": 1, "ownerID": 1}) or {}
    owner = org.get("ownerId") or org.get("owner_id") or org.get("ownerID")
    if not owner:
        raise DriveNotConnected()
    return str(owner)


async def run_for_org(request: Request, org_id, fn, *args):
    """Run fn(drive_service, *args) in a threadpool with the org owner's Drive.
    Drive HttpErrors pass through to the caller; connection problems become 409/503 with a clear message."""
    db = request.app.state.mongo
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    owner_key = None

    def work():
        nonlocal owner_key
        owner_key = org_owner_key(db, org_id)
        return fn(service_for_user(db, owner_key), *args)

    try:
        return await run_in_threadpool(work)
    except DriveNotConnected:
        raise HTTPException(status_code=409, detail=NOT_CONNECTED)
    except (RefreshError, crypto.InvalidToken):
        await run_in_threadpool(mark_disconnected, db, owner_key)
        raise HTTPException(status_code=409, detail=RECONNECT)
    except RuntimeError as e:
        if "TOKEN_ENCRYPTION_KEY" in str(e):
            raise HTTPException(status_code=503, detail="Google Drive is not configured on the server (TOKEN_ENCRYPTION_KEY is missing).")
        raise


def connected_count(db) -> int:
    return db[users.USER_COLLECTION].count_documents({"googleDrive.connected": True})


def import_legacy_token(db) -> None:
    """Blocking, once. Move the old shared google_creds/token.json into user "1" (encrypted). The file is kept
    on disk but no longer read; delete it yourself once Drive works."""
    if not LEGACY_TOKEN_FILE.exists():
        return
    if not crypto.encryption_ready():
        print("Skipping the token.json import: TOKEN_ENCRYPTION_KEY is not set.")
        return
    key = users.DEFAULT_USER_KEY
    user = users.get_or_create(db, key)
    if user.get("legacyTokenImportedAt") or (user.get("googleDrive") or {}).get("tokenEnc"):
        return
    creds = Credentials.from_authorized_user_info(json.loads(LEGACY_TOKEN_FILE.read_text()), SCOPES)
    email = account_email(creds)  # also refreshes an expired access token
    save_connection(db, key, creds.to_json(), email, extra={"legacyTokenImportedAt": datetime.now(timezone.utc)})
    print(f"Imported google_creds/token.json into user {key} (file kept, no longer read).")
