from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

def connect_to_mongodb():
    MONGODB_URI = os.getenv("MONGODB_URI")
    
    if not MONGODB_URI:
        raise ValueError("MONGODB_URI must be set in the environment variables.")
    
    try:
        client = MongoClient(MONGODB_URI)
    except Exception as e:
        raise ConnectionError(f"Failed to connect to MongoDB: {e}")
    
    client_database_name = os.getenv("MONGODB_DATABASE_NAME", None)
    
    if not client_database_name:
        raise ValueError("MONGODB_DATABASE_NAME must be set in the environment variables.")
    
    database_client = client[client_database_name]

    return client, database_client

if __name__ == "__main__":
    _ = connect_to_mongodb()
    print("Successfully connected to MongoDB.")