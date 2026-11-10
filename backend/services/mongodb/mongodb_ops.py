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
    
async def upsert_preserving(database_client: MongoClient, collection_name: str, match: dict, set_fields: dict, insert_defaults: dict):
    # $set refreshes fields on every call; $setOnInsert only applies on first insert,
    # so manually-entered fields (receiptAmount, description, label, snapshot, createdAt) survive re-syncs.
    collection = database_client[collection_name]
    result = collection.update_one(match, {"$set": set_fields, "$setOnInsert": insert_defaults}, upsert=True)
    return result.matched_count, result.upserted_id

async def delete(database_client: MongoClient, collection_name: str, query: dict, delete_many: bool = False):
    collection = database_client[collection_name]
    
    if not delete_many:
        result = collection.delete_one(query)
        return result.deleted_count
    else:
        result = collection.delete_many(query)
        return result.deleted_count
    
async def get_embeddings(ai_database_client: MongoClient, collection_name: str, query_embedding: list[float], user_id, org_id: str | None, limit: int = 5) -> list[dict]:
    collection = ai_database_client[collection_name]
    
    aggregate_pipeline = [
        {
            "$vectorSearch": {
                "index": "long-term-memory",
                "path": "textEmbedding",
                "queryVector": query_embedding,
                "numCandidates": limit * 10,
                "limit": limit,
                # scope recall to the caller + their selected org (orgId is the stored string, or None);
                # requires `userId` and `orgId` as filter fields in the Atlas index
                "filter": {"$and": [{"userId": user_id}, {"orgId": org_id}]},
            }
        },
        {
            "$project": {
                "_id": 1,
                "input": 1,
                "output": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        }
    ]
    
    result = collection.aggregate(aggregate_pipeline)
    
    return list(result)

    
    