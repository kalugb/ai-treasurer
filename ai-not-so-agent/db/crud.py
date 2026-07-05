from datetime import datetime
from zoneinfo import ZoneInfo
from enum import Enum
import os
import sys

# add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.connectdb import connectDB
from bson.objectid import ObjectId
from db.collection_list import Collections

db = connectDB()

# the CRUD operations
# Create (insert_one, insert_many)
class Create:
    @staticmethod
    async def insert_one(collection_name: Collections, data: dict):
        try:
            collection = db[collection_name.value]
            result = await collection.insert_one(data)
            return result
        except Exception as e:
            print(f"MongoDB insert_one failed: {e}")
            return False

    @staticmethod
    async def insert_many(collection_name: Collections, data: list[dict]) -> bool:
        try:
            collection = db[collection_name.value]
            result = await collection.insert_many(data)
            return result
        except Exception as e:
            print(f"MongoDB insert_many failed: {e}")
            return False

# Read (find, find_one)
class Read:
    @staticmethod
    async def find(
        collection_name: Collections, 
        filter: dict, 
        projection: dict = {}, 
        sort_by: str = "", 
        sort_order: int = -1, 
        limit: int = 0, 
        skip: int = 0,
        max_docs: int = 100
    ) -> list[dict]:
        try:
            collection = db[collection_name.value]
            cursor = collection.find(filter, projection=projection)

            if sort_by:
                cursor = cursor.sort(sort_by, sort_order)

            if limit > 0:
                cursor = cursor.limit(limit)

            if skip > 0:
                cursor = cursor.skip(skip)

            num_docs_capped = limit if limit else max_docs
            result = await cursor.to_list(length=num_docs_capped)

            return result
        except Exception as e:
            print(f"MongoDB find failed: {e}")
            return []

    @staticmethod
    async def find_one(
        collection_name: Collections,
        filter: dict,
        projection: dict = {},
    ) -> dict:
        try:
            collection = db[collection_name.value]
            result = await collection.find_one(filter, projection=projection)
            return dict(result) if result else {}
        except Exception as e:
            print(f"MongoDB find_one failed: {e}")
            return {}

# Update (update_one, update_many)
class Update:
    @staticmethod
    async def update_one(
        collection_name: Collections,
        filter: dict,
        update: dict,
        upsert: bool = False
    ) -> bool:
        
        try:
            collection = db[collection_name.value]
            result = await collection.update_one(filter, update, upsert=upsert)
            return result.modified_count > 0
        except Exception as e:
            print(f"MongoDB update_one failed: {e}")
            return False

    @staticmethod
    async def update_many(
        collection_name: Collections,
        filter: dict,
        update: dict,
        upsert: bool = False
    ) -> bool:
        try:
            collection = db[collection_name.value]
            result = await collection.update_many(filter, update, upsert=upsert)
            return result.modified_count > 0
        except Exception as e:
            print(f"MongoDB update_many failed: {e}")
            return False

# Delete (delete_one, delete_many)
class Delete:
    @staticmethod
    async def delete_one(
        collection_name: Collections,
        filter: dict
    ) -> bool:
        try:
            collection = db[collection_name.value]
            result = await collection.delete_one(filter)
            return result.deleted_count > 0
        except Exception as e:
            print(f"MongoDB delete_one failed: {e}")
            return False

    @staticmethod
    async def delete_many(
        collection_name: Collections,
        filter: dict,
    ) -> bool:
        try:
            collection = db[collection_name.value]
            result = await collection.delete_many(filter)
            return result.deleted_count > 0
        except Exception as e:
            print(f"MongoDB delete_many failed: {e}")
            return False

# Aggregation (aggregate)
class Aggregation:
    @staticmethod
    async def aggregate(
        collection_name: Collections,
        pipeline: list,
        max_docs: int = 1000
    ) -> list[dict]:
        try:
            collection = db[collection_name.value]
            cursor = collection.aggregate(pipeline)
            result = await cursor.to_list(length=max_docs)
            return result
        except Exception as e:
            print(f"MongoDB aggregate failed: {e}")
            return [{"Error in aggregation": str(e)}]
        

# for query testing
if __name__ == "__main__":
    import asyncio

    async def main():
        id = ObjectId("6a2b788e1cfd2e0f5c47586f")
        print(await Read.find_one(Collections.USER_MEMORY, {"userID": id}, {"_id": 0, "preferences": 1}))

    asyncio.run(main())