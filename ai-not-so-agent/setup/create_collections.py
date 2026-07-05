from motor.motor_asyncio import AsyncIOMotorClient
import pymongo
from pathlib import Path
import json
import os
import sys

from pymongo.operations import SearchIndexModel
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.collection_list import Collections

async def connect_to_mongo(uri, db_name: str):
    try:
        client = AsyncIOMotorClient(uri)
        db = client[db_name]
        return db
    except Exception as e:
        print(f"Could not connect to MongoDB: {e}")
        return None
    
async def create_collection(db, collection_name_list: list[Collections]):
    for collection_name in collection_name_list:
        try:
            await db.create_collection(collection_name)
            print(f"Collection '{collection_name}' created successfully.")

            # insert dummy data into the collection
            dummy_data = {"message": "This is a dummy document."}
            result = await db[collection_name].insert_one(dummy_data)
            print(f"Inserted dummy document with id: {result.inserted_id} into collection '{collection_name}'.")
        except Exception as e:
            if "already exists" in str(e):
                print(f"Collection '{collection_name}' already exists.")
            else:
                print(f"Error creating collection '{collection_name}': {e}")
    
    print("All specified collections have been processed and created successfully.")

async def create_ttl_index(db):
    ttl_config_path = Path(__file__).parent / "config" / "ttl_index_memories.json"
    with open(ttl_config_path, "r") as f:
        config = json.load(f)

    for config_info in config["ttl_index"]:
        collection_name = config_info["collection_name"]
        collection = db[collection_name]

        ttl_index_field = config_info["field"]
        expire_after_seconds = config_info["expireAfterSeconds"]

        try:
            await collection.create_index(ttl_index_field, expireAfterSeconds=expire_after_seconds)
            print("TTL index created successfully")
        except Exception as e:
            print(f"Error creating TTL index: {e}")

async def create_vector_search_index(db, collection_name: str = "memories"):
    vector_search_index_name = os.getenv("MEMORIES_VECTOR_INDEX_NAME")
    
    vector_search_config_path = Path(__file__).parent / "config" / "vectorSearchIndex.json"
    with open(vector_search_config_path, "r") as f:
        vector_search_config = json.load(f)

    collection = db[collection_name]
    
    search_index_model = SearchIndexModel(
        definition=vector_search_config,
        name=vector_search_index_name,
        type="vectorSearch"
    )

    try:
        await collection.create_search_index(model=search_index_model)
        print("Vector search index created successfully")
    except Exception as e:
        print(f"Error creating vector search index: {e}")

async def main():
    uri = os.getenv("MONGODB_URI")
    db_name = "ai-agent"
    db = await connect_to_mongo(uri, db_name)

    collection_names = [c.value for c in Collections]
    await create_collection(db, collection_names) # type: ignore
    await create_ttl_index(db)
    await create_vector_search_index(db, Collections.MEMORY)
    

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
    