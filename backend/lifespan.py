from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
import asyncio
    
from services.redis.redis_client import get_redis_client
from services.redis.session import SessionStore
from services.redis.cache import CacheStore

from services.mongodb.mongodb_connect import connect_to_mongodb
# from supabase.supabase_connect import connect_to_supabase'
from services.ai.inference.chat import LLMInference

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
    pass

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
    
    if google_drive_service_exists():
        return True, get_drive_service()
    else:
        return False, None


def check_services(app: FastAPI):
    print("Checking service availability...")
    print(f"MongoDB service: {app.state.mongo is not None}")
    print(f"Redis cache service: {app.state.cache is not None}")
    print(f"Session store service: {app.state.sessions is not None}")
    print(f"LLM Inference service: {app.state.llm_inference is not None}")
    print(f"Supabase service: {app.state.supabase is not None}")
    print(f"Google Drive service: {app.state.google_drive_service_connected}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    clients, = await asyncio.gather(
        init_mongodb(),
        # init_llm_inference(),
        # init_supabase()
    )
    
    # do this trick to unpack the clients tuple into individual variables
    mongodb_client, mongodb_database_client = clients
    redis_client = await get_redis_client()
    google_drive_service_connected, google_drive_service = await temp_check_google_integration()
    
    app.state.sessions = SessionStore(redis_client)
    app.state.cache = CacheStore(redis_client)
    app.state.mongo = mongodb_database_client
    app.state.llm_inference = None # llm_inference
    app.state.supabase = None # supabase_client
    app.state.google_drive_service_connected = google_drive_service_connected
    app.state.google_drive_service = google_drive_service
    
    check_services(app)
    yield 

    # Cleanup services
    if mongodb_client:
        mongodb_client.close()
        
    await redis_client.close()