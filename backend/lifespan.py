from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
import asyncio
    
from services.redis.redis_client import RedisLink
from services.redis.events import EventBus
from services.redis.session import SessionStore
from services.redis.cache import CacheStore

from services.mongodb.mongodb_connect import connect_to_mongodb
from services.supabase.supabase_connect import get_supabase_client
from services.ai.inference.chat import LLMInference

from services.ai.embeddings.init_embedding_client import get_embedding_client

from services.ai.tools import treasury_tools, google_tools
from routers.reimbursement import ensure_indexes as ensure_reimbursement_indexes
from services import duplicates, users
from services.google import drive_tokens

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
    print(f"AI database service: {app.state.ai_mongo is not None}")
    print(f"Embeddings client service: {app.state.embeddings_client is not None}")
    print(f"Redis service: {app.state.redis_link.up}")
    print(f"Session store service: {app.state.sessions is not None}")
    print(f"LLM Inference service: {app.state.llm_inference is not None}")
    print(f"Supabase service: {app.state.supabase is not None}")
    try:
        drive_users = drive_tokens.connected_count(app.state.mongo) if app.state.mongo is not None else 0
    except Exception:
        drive_users = "unknown"
    print(f"Google Drive: users connected: {drive_users}")

def _best_effort(label: str, step):
    """Run one startup step; a failure is logged, never stops the app."""
    try:
        step()
    except Exception as e:
        print(f"Could not {label}: {e}")

def prepare_databases(main_db, ai_db, history_db):
    """Create indexes and sweep expired data at startup. Every step is best effort; a missing DB is skipped."""
    from routers.agent import sweep_expired_exports
    from services.ai.history import ensure_indexes as ensure_ai_history_indexes

    if main_db is not None:
        # unique userKey/email; without them a duplicate user/email is possible
        _best_effort("create the user indexes", lambda: users.ensure_indexes(main_db))
        # one-time move of the old shared google_creds/token.json into user "1" (encrypted)
        _best_effort("import google_creds/token.json", lambda: drive_tokens.import_legacy_token(main_db))
        # the server-side pre-check still rejects double links; only the race window is open
        _best_effort("create the reimbursement receipt-link index", lambda: ensure_reimbursement_indexes(main_db))
        # the upload-time pre-insert check still rejects duplicates; only the race window is open
        _best_effort("create the receipt content-hash indexes", lambda: duplicates.ensure_indexes(main_db))
    if ai_db is not None:
        # agent spreadsheets older than 30 days (file + record); on failure they linger until the next start
        _best_effort("sweep expired agent exports", lambda: sweep_expired_exports(ai_db))
    if history_db is not None:
        # listing still works without it, just unindexed
        _best_effort("create the snapshots index", lambda: history_db["snapshots"].create_index(
            [("orgId", 1), ("userId", 1), ("snapshotTime", -1)], name="org_user_time"))
        # incl. the 14-day TTL on startedAt
        _best_effort("create the AI history indexes", lambda: ensure_ai_history_indexes(history_db))

@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_clients, supabase_client,  = await asyncio.gather(
        init_mongodb(),
        init_supabase(),
        # init_llm_inference(),
        # init_embeddings_client()
    )
    
    # do this trick to unpack the clients tuple into individual variables
    mongodb_client, mongodb_database_client = mongo_clients
    # Redis is optional: if it is unreachable the cache and agent events use in-process fallbacks
    redis_link = RedisLink()
    redis_up = await redis_link.ensure()
    print("Redis connected." if redis_up else "Redis unavailable, using the in-memory fallback (single worker only).")
    
    app.state.sessions = SessionStore(redis_link.client)  # not used by any route yet; needs Redis if it ever is
    app.state.cache = CacheStore(redis_link)
    app.state.events = EventBus(redis_link)
    app.state.mongo = mongodb_database_client

    treasury_tools.set_mongo(mongodb_database_client)
    google_tools.set_mongo(mongodb_database_client)

    app.state.ai_mongo = mongodb_client["ai"] if mongodb_client else None
    app.state.history_mongo = mongodb_client["history"] if mongodb_client else None  # snapshots; same cluster/client as the main DB
    prepare_databases(mongodb_database_client, app.state.ai_mongo, app.state.history_mongo)
    app.state.redis_link = redis_link
    app.state.llm_inference = None # llm_inference
    app.state.embeddings_client = None # embeddings_client
    app.state.supabase = supabase_client
    
    check_services(app)
    
    yield 

    # Cleanup services
    if mongodb_client:
        mongodb_client.close()
        
    await redis_link.close()