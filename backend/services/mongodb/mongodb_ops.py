from pymongo import MongoClient

def create(database_client: MongoClient, doc_to_create: dict, collection_name: str, create_many: bool = False):
    collection = database_client[collection_name]
    
    if not create_many:
        result = collection.insert_one(doc_to_create)
        return result.inserted_id
    else:
        result = collection.insert_many(doc_to_create)
        return result.inserted_ids
    
def read(database_client: MongoClient, query: dict | None, collection_name: str, read_many: bool = False):
    collection = database_client[collection_name]
    
    if not read_many:
        result = collection.find_one(query)
        return result
    else:
        result = collection.find(query)
        return list(result)
    
def update(database_client: MongoClient, query: dict, update_data: dict, collection_name: str, update_many: bool = False):
    collection = database_client[collection_name]
    
    if not update_many:
        result = collection.update_one(query, {"$set": update_data})
        return result.modified_count
    else:
        result = collection.update_many(query, {"$set": update_data})
        return result.modified_count
    
def delete(database_client: MongoClient, query: dict, collection_name: str, delete_many: bool = False):
    collection = database_client[collection_name]
    
    if not delete_many:
        result = collection.delete_one(query)
        return result.deleted_count
    else:
        result = collection.delete_many(query)
        return result.deleted_count
    
if __name__ == "__main__":
    from mongodb_connect import connect_to_mongodb
    
    database = connect_to_mongodb()
    results = read(
        database_client=database,
        query=None,
        collection_name="organizations",
        read_many=True
    )
    
    print("Read results:", results)
    print(type(results))
    
    
    