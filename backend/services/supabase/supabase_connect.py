from supabase import create_client, Client
from dotenv import load_dotenv
import os
import httpx

load_dotenv()

url: str = os.getenv("SUPABASE_URL")  
key: str = os.getenv("SUPABASE_PUBLISHABLE_KEY")
secret_key: str = os.getenv("SUPABASE_SECRET_KEY")

supabase: Client = create_client(url, key)

_storage_client: Client | None = None


def get_storage_client() -> Client:
    # storage writes need the service-role key; the publishable key is blocked by RLS. Server-side only.
    global _storage_client
    if _storage_client is None:
        if not secret_key:
            raise ValueError("SUPABASE_SECRET_KEY must be set for storage writes.")
        _storage_client = create_client(url, secret_key)
    return _storage_client


def new_storage_client() -> Client:
    # a fresh client (own httpx connection) for use in a dedicated worker thread; the shared one is not thread-safe
    if not secret_key:
        raise ValueError("SUPABASE_SECRET_KEY must be set for storage writes.")
    return create_client(url, secret_key)
    
def _ping_supabase(timeout=15.0):
    try:
        r = httpx.get(
            f"{url}/auth/v1/health",
            headers={"apikey": key},
            timeout=timeout,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        print("Ping failed:", e)
        return False
        
    
async def get_supabase_client() -> Client:
    supabase_client = create_client(url, key)
    
    if not _ping_supabase():
        raise ConnectionError("Supabase is not reachable")
    
    return supabase_client


if __name__ == "__main__":
    import asyncio
    import time
    
    async def main():
        start = time.time()
        client = await get_supabase_client()
        print("Supabase client created:", client)
        
        # test bucket retrieval
        try:
            bucket_name = "receipts"
            buckets = client.storage.from_(bucket_name).list()
            print(f"File in bucket {bucket_name}:", buckets)
            end = time.time()
            
            print(f"Time taken to retrieve file in bucket {bucket_name}: {end - start:.2f} seconds")
        except Exception as e:
            print(f"Error retrieving file in bucket {bucket_name}:", e)
        
    asyncio.run(main())