import os
import json
from pymongo.operations import SearchIndexModel
from pathlib import Path
from dotenv import load_dotenv
import sys

load_dotenv()
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.connectdb import connectDB

db = connectDB()

async def create_vector_search_index(collection_name: str = "memories"):
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


if __name__ == "__main__":
    import asyncio
    asyncio.run(create_vector_search_index())

