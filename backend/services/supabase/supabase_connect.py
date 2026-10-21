from supabase import create_client, Client
from dotenv import load_dotenv
import os
import time
import httpx

load_dotenv()

url: str = os.getenv("SUPABASE_URL")  
key: str = os.getenv("SUPABASE_PUBLISHABLE_KEY")

supabase: Client = create_client(url, key)
    
def _ping_supabase(timeout=5.0):
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
    
    async def main():
        client = await get_supabase_client()
        print("Supabase client created:", client)
        
        # test bucket retrieval
        try:
            bucket_name = "receipts"
            buckets = client.storage.from_(bucket_name).list()
            print(f"File in bucket {bucket_name}:", buckets)
        except Exception as e:
            print(f"Error retrieving file in bucket {bucket_name}:", e)
        
    asyncio.run(main())