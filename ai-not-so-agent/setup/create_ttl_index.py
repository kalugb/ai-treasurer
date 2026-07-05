import json
from pathlib import Path
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.connectdb import connectDB

db = connectDB()

async def create_ttl_index(collection_name: str = "memories"):
    ttl_config_path = Path(__file__).parent / "config" / "ttl_index_memories.json"
    with open(ttl_config_path, "r") as f:
        config = json.load(f)

    ttl_config = config["ttl"]
    field = ttl_config["field"]
    expire_after_seconds = ttl_config["expireAfterSeconds"]

    collection = db[collection_name]

    try:
        await collection.create_index(field, expireAfterSeconds=expire_after_seconds)
        print("TTL index created successfully")
    except Exception as e:
        print(f"Error creating TTL index: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(create_ttl_index())