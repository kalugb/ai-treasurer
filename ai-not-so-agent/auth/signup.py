import bcrypt
from db.crud import Collections, Read, Create
import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

async def sign_up(username: str, password: str, name: str, email: str) -> dict | None:
    existing = await Read.find_one(
        Collections.USERS, {"username": username}, {"_id": 1}
    )
    if existing:
        print("Username already exists. Please choose a different username.")
        return None

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    result = await Create.insert_one(
        Collections.USERS,
        {"username": username, "pwd": hashed, "name": name, "email": email},
    )
    if not result:
        print("Error signing up")
        return None
    
    print(f"Sign up successfully with user id: {result.inserted_id}")
    print("Sign in using your username and password later after this...")
    return {"user_id": result.inserted_id, "username": username}
