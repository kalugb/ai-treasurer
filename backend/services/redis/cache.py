import time
from collections import OrderedDict
from typing import Any
from bson.json_util import dumps, loads

MAX_FALLBACK_BYTES = 64 * 1024 * 1024  # cap for the in-memory thumbnail cache

class CacheStore:
    """Redis cache with an in-process fallback, so the app keeps working when Redis is down.
    shortcut: the fallback is per process, so with more than one worker an edit only clears the cache of
    the worker that handled it; run a single worker without Redis, or upgrade to a shared store."""

    def __init__(self, link, cache_ttl_seconds: int = 300, cache_prefix: str = "cache:", max_fallback_bytes: int = MAX_FALLBACK_BYTES):
        self._link = link  # services.redis.redis_client.RedisLink
        self.cache_ttl = cache_ttl_seconds
        self.cache_prefix = cache_prefix
        self._max_bytes = max_fallback_bytes
        self._json: dict[str, tuple[float, str]] = {}  # key -> (expires at, serialized value); serialized so callers get copies
        self._bytes: OrderedDict[str, tuple[float, bytes]] = OrderedDict()  # least recently used first
        self._bytes_total = 0
        self._used_fallback = False

    def _key(self, key: str) -> str:
        return f"{self.cache_prefix}{key}"
    
    def key_builder(self, identifier: str, key_name: str) -> str:
        return f"{identifier}:{key_name}"

    async def _live(self) -> bool:
        """True when Redis is usable. On the first call after an outage the stale copies are dropped."""
        if not await self._link.ensure():
            self._used_fallback = True
            return False
        if self._used_fallback:
            # edits made during the outage never reached Redis, so whatever it still holds may be stale
            self._json.clear()
            self._bytes.clear()
            self._bytes_total = 0
            self._used_fallback = False
            try:
                async for key in self._link.client.scan_iter(match=f"{self.cache_prefix}*"):
                    await self._link.client.delete(key)
            except Exception as e:
                self._failed(e)
                return False
        return True

    def _failed(self, error: Exception):
        self._link.mark_down(error)
        self._used_fallback = True

    def _drop_bytes(self, prefixed_key: str):
        entry = self._bytes.pop(prefixed_key, None)
        if entry:
            self._bytes_total -= len(entry[1])
    
    async def set(self, key: str, value: Any, custom_ttl: int | None = None):
        prefixed_key = self._key(key)
        serialized_value = dumps(value)  # Convert to JSON-compatible format
        set_ttl = custom_ttl if custom_ttl is not None else self.cache_ttl

        if await self._live():
            try:
                await self._link.client.set(prefixed_key, serialized_value, ex=set_ttl)
                return
            except Exception as e:
                self._failed(e)
        self._json[prefixed_key] = (time.monotonic() + set_ttl, serialized_value)
        
    async def get(self, key: str) -> Any | None:
        prefixed_key = self._key(key)

        if await self._live():
            try:
                raw_value = await self._link.client.get(prefixed_key)
                return loads(raw_value) if raw_value else None
            except Exception as e:
                self._failed(e)
        entry = self._json.get(prefixed_key)
        if entry is None:
            return None
        if entry[0] <= time.monotonic():
            del self._json[prefixed_key]
            return None
        return loads(entry[1])
    
    async def delete(self, key: str) -> None:
        prefixed_key = self._key(key)

        if await self._live():
            try:
                await self._link.client.delete(prefixed_key)
                return
            except Exception as e:
                self._failed(e)
        self._json.pop(prefixed_key, None)
        self._drop_bytes(prefixed_key)

    # raw bytes path: BSON dumps/loads would corrupt binary image data, so store/read bytes directly
    # via a decode_responses=False client (the main client decodes to str and breaks on non-utf8 bytes)
    async def set_bytes(self, key: str, value: bytes, custom_ttl: int | None = None):
        prefixed_key = self._key(key)
        set_ttl = custom_ttl if custom_ttl is not None else self.cache_ttl

        if await self._live():
            try:
                await self._link.bytes_client.set(prefixed_key, value, ex=set_ttl)
                return
            except Exception as e:
                self._failed(e)
        if len(value) > self._max_bytes:
            return  # too big to keep in memory
        self._drop_bytes(prefixed_key)
        self._bytes[prefixed_key] = (time.monotonic() + set_ttl, value)
        self._bytes_total += len(value)
        while self._bytes_total > self._max_bytes:
            self._drop_bytes(next(iter(self._bytes)))  # evict the least recently used

    async def get_bytes(self, key: str) -> bytes | None:
        prefixed_key = self._key(key)

        if await self._live():
            try:
                return await self._link.bytes_client.get(prefixed_key)
            except Exception as e:
                self._failed(e)
        entry = self._bytes.get(prefixed_key)
        if entry is None:
            return None
        if entry[0] <= time.monotonic():
            self._drop_bytes(prefixed_key)
            return None
        self._bytes.move_to_end(prefixed_key)
        return entry[1]
        
    # below methods is for debugging purposes only (Redis only)
    async def check_exists(self, key: str):
        return await self._link.client.exists(self._key(key)) > 0
    
    async def check_ttl_remaining(self, key: str) -> int | None:
        ttl = await self._link.client.ttl(self._key(key))
        return ttl if ttl >= 0 else None
    
if __name__ == "__main__":
    import asyncio
    from datetime import datetime, timezone
    from bson import ObjectId
    from services.redis.redis_client import RedisLink

    async def fallback_check():
        # nothing listens on port 1, so every call must use the in-memory fallback
        link = RedisLink("redis://127.0.0.1:1/0", cooldown=3600)
        cache_store = CacheStore(link, max_fallback_bytes=10)
        key = cache_store.key_builder("org", "teams")

        assert await cache_store.get(key) is None
        value = {"_id": ObjectId(), "at": datetime(2026, 1, 2, 3, 4, 5), "n": [1, 2]}  # loads() returns naive datetimes, same as the Redis path
        await cache_store.set(key, value)
        got = await cache_store.get(key)
        assert got == value and got is not value, "fallback must round-trip BSON types and return a copy"
        await cache_store.delete(key)
        assert await cache_store.get(key) is None

        await cache_store.set(key, value, custom_ttl=-1)
        assert await cache_store.get(key) is None, "expired entry must not be returned"

        await cache_store.set_bytes("a", b"123456")
        await cache_store.set_bytes("b", b"123456")  # 12 bytes > cap of 10: "a" is evicted
        assert await cache_store.get_bytes("a") is None and await cache_store.get_bytes("b") == b"123456"
        await cache_store.set_bytes("c", b"x" * 11)  # larger than the whole cap: not stored
        assert await cache_store.get_bytes("c") is None
        await cache_store.delete("b")
        assert await cache_store.get_bytes("b") is None
        await link.close()
        print("OK: in-memory fallback self-check passed")

    async def redis_check():
        from services.redis.redis_client import get_redis_client
        link = RedisLink()
        if not await link.ensure():
            print("Redis not reachable here; skipped the live Redis check")
            return
        cache_store = CacheStore(link)

        # test with BSON types included, to prove the fix works
        example_cache_value = {
            "_id": ObjectId(),
            "created_at": datetime.now(timezone.utc),
            "value": 42,
        }
        key = cache_store.key_builder("custom_user_id", "dashboard")
        await cache_store.set(key, example_cache_value, custom_ttl=60)
        value = await cache_store.get(key)

        print("Retrieved value:", value)
        print("_id type:", type(value["_id"]))          # should print <class 'bson.objectid.ObjectId'>
        print("created_at type:", type(value["created_at"]))  # should print <class 'datetime.datetime'>

        exists = await cache_store.check_exists(key)
        print("Key exists:", exists)

        ttl_remaining = await cache_store.check_ttl_remaining(key)
        print("TTL remaining:", ttl_remaining)

        # raw bytes path must round-trip binary unchanged (not via BSON)
        raw = b"\x89PNG\x00\x01\x02\xff"
        bytes_key = cache_store.key_builder("custom_file_id", "thumb")
        await cache_store.set_bytes(bytes_key, raw, custom_ttl=60)
        got = await cache_store.get_bytes(bytes_key)
        assert got == raw, f"bytes round-trip mismatch: {got!r}"
        assert isinstance(got, bytes), f"expected bytes, got {type(got)}"
        print("OK: raw bytes round-trip passed")
        await link.close()

    async def main():
        await fallback_check()
        await redis_check()

    asyncio.run(main())
