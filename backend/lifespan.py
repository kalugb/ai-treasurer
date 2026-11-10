from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
import asyncio
    
from services.redis.redis_client import get_redis_client
from services.redis.session import SessionStore
from services.redis.cache import CacheStore

from services.mongodb.mongodb_connect import connect_to_mongodb
from services.supabase.supabase_connect import get_supabase_client
from services.ai.inference.chat import LLMInference

from services.ai.embeddings.init_embedding_client import get_embedding_client

from services.ai.tools import treasury_tools

from dotenv import load_dotenv
import os

load_dotenv()

async def init_mongodb():
    try:
        client, database_client = connect_to_mongodb()
        print("Successfully connected to MongoDB.")
        
        return client, database_client
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        
        return None, None
    
async def init_supabase():
    try:
        supabase_client = await get_supabase_client()
        print("Successfully connected to Supabase.")
        
        return supabase_client
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}")
        
        return None

async def init_llm_inference():
    try:
        llm_inference = await LLMInference.get_instance()
        print("Successfully initialized LLM Inference.")
        
        return llm_inference
    except Exception as e:
        print(f"Failed to initialize LLM Inference: {e}")
        
        return None
    
async def temp_check_google_integration() -> bool:
    from services.google.google_connect import google_drive_service_exists, get_drive_service
    from services.google.google_ops import GoogleDriveService
    
    if google_drive_service_exists():
        drive_service = get_drive_service()
        drive_service_instance = GoogleDriveService(drive_service)
        
        return True, drive_service_instance
    else:
        return False, None
    
async def init_embeddings_client():
    try:
        embedding_client = get_embedding_client()
        print("Successfully initialized Embeddings Client.")
        
        return embedding_client
    except Exception as e:
        print(f"Failed to initialize Embeddings Client: {e}")
        
        return None


def check_services(app: FastAPI):
    print("Checking service availability...")
    print(f"MongoDB service: {app.state.mongo is not None}")
    print(f"AI MongoDB service: {app.state.ai_mongo is not None}")
    print(f"Embeddings client service: {app.state.embeddings_client is not None}")
    print(f"Redis cache service: {app.state.cache is not None}")
    print(f"Session store service: {app.state.sessions is not None}")
    print(f"LLM Inference service: {app.state.llm_inference is not None}")
    print(f"Supabase service: {app.state.supabase is not None}")
    print(f"Google Drive service: {app.state.google_drive_service_connected and bool(app.state.google_drive_service_instance)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_clients, supabase_client, llm_inference, embeddings_client = await asyncio.gather(
        init_mongodb(),
        init_supabase(),
        init_llm_inference(),
        init_embeddings_client()
    )
    
    # do this trick to unpack the clients tuple into individual variables
    mongodb_client, mongodb_database_client = mongo_clients
    redis_client = await get_redis_client()
    bytes_redis_client = await get_redis_client(decode_responses=False)  # raw-bytes cache (thumbnails)
    google_drive_service_connected, google_drive_service_instance = await temp_check_google_integration()
    
    app.state.sessions = SessionStore(redis_client)
    app.state.cache = CacheStore(redis_client, bytes_redis_client=bytes_redis_client)
    app.state.mongo = mongodb_database_client

    treasury_tools.set_mongo(mongodb_database_client)

    app.state.ai_mongo = mongodb_client["ai"] if mongodb_client else None
    app.state.redis = redis_client 
    app.state.llm_inference = llm_inference
    app.state.embeddings_client = embeddings_client
    app.state.supabase = supabase_client
    app.state.google_drive_service_connected = google_drive_service_connected
    app.state.google_drive_service_instance = google_drive_service_instance
    
    check_services(app)
    
    yield 

    # Cleanup services
    if mongodb_client:
        mongodb_client.close()
        
    await redis_client.close()
    await bytes_redis_client.close()