import bcrypt
from db.crud import Collections, Read
import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

async def login(username: str, password: str) -> dict | None:
    user = await Read.find_one(
        Collections.USERS,
        {"username": username},
        {"_id": 1, "username": 1, "pwd": 1},
    )
    if not user:
        print("User not found. Please sign up first.")
        return None

    stored_hash = user.get("pwd")
    if stored_hash and bcrypt.checkpw(password.encode("utf-8"), stored_hash):
        print(f"Login successfully with username: {user['username']}")
        print(f"User ID: {user['_id']}")
        return {"user_id": user["_id"], "username": user["username"]}

    print("Incorrect username or password")
    return None
