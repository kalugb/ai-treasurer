import json
from typing import Any
import uuid

class SessionStore:
    def __init__(self, redis_client, session_ttl_seconds: int = 3600, session_prefix: str = "session:"):
        self._redis = redis_client
        self.session_ttl = session_ttl_seconds
        self.session_prefix = session_prefix
    
    async def create_new_session(self):
        session_id = str(uuid.uuid4())
        empty_session_data = {}
        
        await self._redis.set(self._key(session_id), json.dumps(empty_session_data), ex=self.session_ttl)
        
        return session_id
    
    def _key(self, key: str) -> str:
        return f"{self.session_prefix}{key}"
    
    async def get(self, session_id: str):
        prefixed_key = self._key(session_id)
        raw_value = await self._redis.get(prefixed_key)
        
        return json.loads(raw_value) if raw_value else None
    
    async def set(self, session_id: str, session_key: str, new_value: Any):
        prefixed_key = self._key(session_id)
        session = await self.get(session_id)
        if session is None:
            return
        
        session[session_key] = new_value
        await self._redis.set(prefixed_key, json.dumps(session), ex=self.session_ttl)
        
    async def delete(self, session_id: str):
        prefixed_key = self._key(session_id)
        await self._redis.delete(prefixed_key)
        
    async def extend(self, session_id: str) -> bool:
        prefixed_key = self._key(session_id)
        result = await self._redis.expire(prefixed_key, self.session_ttl)
        
        return bool(result)
    
    # debugging only
    async def check_exists(self, session_id: str):
        prefixed_key = self._key(session_id)
        return await self._redis.exists(prefixed_key) > 0
    
    async def check_ttl_remaining(self, session_id: str) -> int | None:
        prefixed_key = self._key(session_id)
        ttl = await self._redis.ttl(prefixed_key    )
        return ttl if ttl >= 0 else None
    
if __name__ == "__main__":
    import asyncio
    import random
    from services.redis.redis_client import get_redis_client

    async def main():
        session_store = SessionStore(await get_redis_client())
        
        # Example usage
        new_session_id = await session_store.create_new_session()
        print(f"New session created with ID: {new_session_id}")
        
        # Set a value in the session
        await session_store.set(new_session_id, "user_id", random.randint(1, 1000))  # Example user_id
        
        # Retrieve the session data
        session_data = await session_store.get(new_session_id)
        print(f"Session data: {session_data}")
        
        # Extend the session TTL
        extended = await session_store.extend(new_session_id)
        print(f"Session TTL extended: {extended}")
        
        # Check if the session exists
        exists = await session_store.check_exists(new_session_id)
        print(f"Session exists: {exists}")
        
        # Check remaining TTL
        ttl_remaining = await session_store.check_ttl_remaining(new_session_id)
        print(f"TTL remaining: {ttl_remaining} seconds")
        
        # Delete the session
        # await session_store.delete(new_session_id)
        # print(f"Session with ID {new_session_id} deleted.")
    
    asyncio.run(main())