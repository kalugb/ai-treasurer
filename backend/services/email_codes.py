"""One-time email codes (verify an email, reset a password). Blocking pymongo calls; run them in a threadpool.

A 6-digit code is only safe if it is short-lived, single-use and attempt-limited, and if a copy of the database
can't be used to read it: it is stored as an HMAC keyed from TOKEN_ENCRYPTION_KEY, never in clear.
Collection `emailCodes` (main DB): {email, purpose, codeHash, attempts, sentAt, expiresAt}, one live code per
(email, purpose); a resend replaces it.
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pymongo import ReturnDocument

COLLECTION = "emailCodes"
PURPOSES = ("verify", "reset")
TTL_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_SECONDS = 60
BAD_CODE = "That code is wrong or has expired."


def ensure_indexes(db) -> None:
    col = db[COLLECTION]
    col.create_index("expiresAt", expireAfterSeconds=0, name="ttl_expiresAt")
    col.create_index([("email", 1), ("purpose", 1)], unique=True, name="uniq_email_purpose")


def _hash(email: str, purpose: str, code: str) -> str:
    key = (os.getenv("TOKEN_ENCRYPTION_KEY") or "").encode()
    if not key:
        raise HTTPException(status_code=503, detail="Email codes are not configured")
    return hmac.new(key, f"{email}|{purpose}|{code}".encode(), hashlib.sha256).hexdigest()


def issue(db, email: str, purpose: str) -> str:
    """A fresh code for this email, replacing any live one. 429 inside the resend cooldown."""
    now = datetime.now(timezone.utc)
    col = db[COLLECTION]
    live = col.find_one({"email": email, "purpose": purpose})
    if live and live["sentAt"].replace(tzinfo=timezone.utc) > now - timedelta(seconds=RESEND_SECONDS):
        raise HTTPException(status_code=429, detail="Please wait a minute before asking for another code.")
    code = f"{secrets.randbelow(10**6):06d}"
    col.replace_one(
        {"email": email, "purpose": purpose},
        {"email": email, "purpose": purpose, "codeHash": _hash(email, purpose, code), "attempts": 0,
         "sentAt": now, "expiresAt": now + timedelta(minutes=TTL_MINUTES)},
        upsert=True,
    )
    return code


def check(db, email: str, purpose: str, code: str) -> None:
    """Consumes the code when right. Anything else is the same 400, so the reply says nothing about which part failed."""
    col = db[COLLECTION]
    # count the attempt first and atomically, so parallel guesses can't all slip under the limit
    doc = col.find_one_and_update({"email": email, "purpose": purpose, "attempts": {"$lt": MAX_ATTEMPTS},
                                   "expiresAt": {"$gt": datetime.now(timezone.utc)}},
                                  {"$inc": {"attempts": 1}}, return_document=ReturnDocument.AFTER)
    if doc is None or not hmac.compare_digest(doc["codeHash"], _hash(email, purpose, code.strip())):
        raise HTTPException(status_code=400, detail=BAD_CODE)
    if not col.delete_one({"_id": doc["_id"]}).deleted_count:  # a parallel request used it first
        raise HTTPException(status_code=400, detail=BAD_CODE)
