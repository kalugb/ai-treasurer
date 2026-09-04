from pymongo import MongoClient

async def create(database_client: MongoClient, doc_to_create: dict, collection_name: str, create_many: bool = False):
    collection = database_client[collection_name]
    
    if not create_many:
        result = collection.insert_one(doc_to_create)
        return result.inserted_id
    else:
        result = collection.insert_many(doc_to_create)
        return result.inserted_ids
    
async def read(database_client: MongoClient, collection_name: str, query: dict | None, projection: dict | None = {}, read_many: bool = False):
    collection = database_client[collection_name]
    
    if not read_many:
        result = collection.find_one(query, projection)
        return result
    else:
        result = collection.find(query, projection)
        return list(result)
    
async def update(database_client: MongoClient, query: dict, collection_name: str, update_data: dict, update_many: bool = False):
    collection = database_client[collection_name]
    
    if not update_many:
        result = collection.update_one(query, {"$set": update_data})
        return result.modified_count
    else:
        result = collection.update_many(query, {"$set": update_data})
        return result.modified_count
    
async def delete(database_client: MongoClient, collection_name: str, query: dict, delete_many: bool = False):
    collection = database_client[collection_name]
    
    if not delete_many:
        result = collection.delete_one(query)
        return result.deleted_count
    else:
        result = collection.delete_many(query)
        return result.deleted_count

    
    