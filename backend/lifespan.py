from contextlib import asynccontextmanager
from fastapi import FastAPI
import asyncio\
    
from services.session import SessionStore

from services.mongodb.mongodb_connect import connect_to_mongodb
# from supabase.supabase_connect import connect_to_supabase'
from services.ai.inference.chat import LLMInference

async def init_mongodb():
    try:
        client = connect_to_mongodb()
        print("Successfully connected to MongoDB.")
        
        return client
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        
        return None
    
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    
    mongodb_client, = await asyncio.gather(
        init_mongodb(),
        # init_llm_inference(),
        # init_supabase()
    )
    app.state.sessions = SessionStore(ttl_seconds=3600)
    app.state.mongo = mongodb_client
    # app.state.llm_inference = llm_inference
    # app.state.supabase = supabase_client

    yield 

    # Cleanup services
    if mongodb_client:
        mongodb_client.close()