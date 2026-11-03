import redis.asyncio as redis
from dotenv import load_dotenv
import os

load_dotenv()

async def get_redis_client(decode_responses: bool = True) -> redis.Redis:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    
    redis_client = redis.from_url(redis_url, decode_responses=decode_responses)
    
    await redis_client.ping()  # Test the connection
    
    return redis_client