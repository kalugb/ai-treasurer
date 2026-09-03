import json
from typing import Any

class CacheStore:
    def __init__(self, redis_client, cache_ttl_seconds: int = 300, cache_prefix: str = "cache:"):
        self._redis = redis_client
        self.cache_ttl = cache_ttl_seconds
        self.cache_prefix = cache_prefix
    
    def _key(self, key: str) -> str:
        return f"{self.cache_prefix}{key}"
    
    def key_builder(self, identifier: str, key_name: str) -> str:
        return f"{identifier}:{key_name}"
    
    async def set(self, key: str, value: Any, custom_ttl: int | None = None):
        prefixed_key = self._key(key)
        jsoned_value = json.dumps(value)
        set_ttl = custom_ttl if custom_ttl is not None else self.cache_ttl
        
        await self._redis.set(prefixed_key, jsoned_value, ex=set_ttl)
        
    async def get(self, key: str) -> Any | None:
        prefixed_key = self._key(key)
        raw_value = await self._redis.get(prefixed_key)
        
        return json.loads(raw_value) if raw_value else None
    
    async def delete(self, key: str) -> None:
        prefixed_key = self._key(key)
        
        await self._redis.delete(prefixed_key)
        
    # below methods is for debugging purposes only
    async def check_exists(self, key: str):
        return await self._redis.exists(self._key(key)) > 0
    
    async def check_ttl_remaining(self, key: str) -> int | None:
        ttl = await self._redis.ttl(self._key(key))
        return ttl if ttl >= 0 else None
    
if __name__ == "__main__":
    import asyncio
    from services.redis.redis_client import get_redis_client

    async def main():
        cache_store = CacheStore(await get_redis_client())
        
        # Example usage
        example_cache_value = {"value": 42, "description": "The answer to life, the universe, and everything."}
        key = cache_store.key_builder("custom_user_id", "dashboard")
        await cache_store.set(key, example_cache_value, custom_ttl=60)
        value = await cache_store.get(key)
        print("Retrieved value:", value)
        print(type(value))
        
        exists = await cache_store.check_exists(key)
        print("Key exists:", exists)
        
        ttl_remaining = await cache_store.check_ttl_remaining(key)
        print("TTL remaining:", ttl_remaining)
        
        # await cache_store.delete("test_key")
        # exists_after_delete = await cache_store.check_exists("test_key")
        # print("Key exists after delete:", exists_after_delete)

    asyncio.run(main())
        
        