from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from typing import Any

load_dotenv()

uri = os.getenv("MONGODB_URI")

def connectDB() -> Any:
    try:
        client: AsyncIOMotorClient = AsyncIOMotorClient(uri)
        db = client["ai-agent"]
        return db
    except Exception as e:
        print(e)

async def main():
    db = connectDB()

    collection = db["memory"]
    cursor = await collection.find_one()

    if cursor:
        print(cursor)
    else:
        print("No document found")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())