from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from bson.objectid import ObjectId
from pathlib import Path
from typing import Optional
import httpx
import secrets
import json
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.crud import Create, Delete, Read, Update, Collections

SESSION_FILE = Path(__file__).parent / "session_token.json"
SESSION_DURATION_HOURS = 1

def get_current_time() -> datetime:
    return datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))

def make_timezone_aware(dt): 
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ZoneInfo("UTC"))
    
    return dt.astimezone(ZoneInfo("Asia/Kuala_Lumpur"))

def generate_session_token() -> str:
    return secrets.token_hex(32)

async def get_public_ip() -> str:
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.ipify.org")
        response.raise_for_status()
        return response.text.strip()

# --- local session file ---

def save_local_session(token: str, user_id: str, username: str, expires_at: datetime):
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SESSION_FILE, "w") as f:
        json.dump({
            "token": token,
            "user_id": user_id,
            "username": username,
            "expires_at": expires_at.isoformat()
        }, f, indent=2)

def load_local_session() -> dict | None:
    if not SESSION_FILE.exists():
        return None
    with open(SESSION_FILE, "r") as f:
        return json.load(f)

def clear_local_session():
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()

def is_local_session_expired(session: dict) -> bool:
    expires_at = make_timezone_aware(datetime.fromisoformat(session["expires_at"]))
    return get_current_time() > expires_at

# --- mongodb session ---

async def create_session(user_id: ObjectId, username: str) -> Optional[str]:
    token = generate_session_token()
    ip = await get_public_ip()
    now = get_current_time()
    expires_at = now + timedelta(hours=SESSION_DURATION_HOURS)

    result = await Create.insert_one(Collections.SESSION, {
        "userID": user_id,
        "username": username,
        "token": token,
        "ip": ip,
        "createdAt": now,
        "lastSeen": now,
        "expiresAt": expires_at,
        "active": True
    })

    if not result:
        print("Error creating session")
        return None

    save_local_session(token, str(user_id), username, expires_at)
    print("Session created successfully:", result.inserted_id)
    return token

async def validate_session(token: str, user_id: str) -> bool:
    session = await Read.find_one(Collections.SESSION, {
        "token": token,
        "userID": ObjectId(user_id),
        "active": True
    })

    if not session:
        print("Session not found or inactive.")
        return False

    now = get_current_time()
    expires_at = make_timezone_aware(session["expiresAt"])

    # check expiry server side
    if now > expires_at:
        print("Session expired.")
        await invalidate_session(token)
        clear_local_session()
        return False

    # soft IP check
    current_ip = await get_public_ip()
    if session.get("ip") and session["ip"] != current_ip:
        print(f"IP changed: {session['ip']} → {current_ip}")

    # update last seen + ip
    await Update.update_one(Collections.SESSION, {"token": token}, {
        "$set": {
            "lastSeen": now,
            "ip": current_ip
        }
    })

    return True

async def invalidate_session(token: str) -> bool:
    result = await Delete.delete_one(Collections.SESSION, {"token": token})

    if result:
        print("Session invalidated.")
        clear_local_session()
        return True

    print("Error invalidating session.")
    return False