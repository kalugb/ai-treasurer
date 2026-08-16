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
    
    return client

if __name__ == "__main__":
    client = connect_to_mongodb()
    print("Successfully connected to MongoDB.")