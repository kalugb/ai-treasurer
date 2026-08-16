from supabase import create_client, Client
from dotenv import load_dotenv
import os

load_dotenv()

url: str = os.getenv("SUPABASE_URL")  
key: str = os.getenv("SUPABASE_PUBLISHABLE_KEY")

supabase: Client = create_client(url, key)

# Test: list files in a bucket
bucket_name = "receipts"
try:
    response = supabase.storage.from_(bucket_name).list()
    print("Connected! Files in bucket:", response)
except Exception as e:
    print("Connection failed:", e)