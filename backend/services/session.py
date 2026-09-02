import json
import uuid
from typing import Any

import redis.asyncio as redis


class SessionStore:
    def __init__(self, redis_url: str, ttl_seconds: int = 3600):
        self._redis = redis.from_url(redis_url, decode_responses=True)
        self.ttl = ttl_seconds

    async def create(self) -> str:
        session_id = str(uuid.uuid4())
        await self._redis.set(session_id, json.dumps({}), ex=self.ttl)
        return session_id

    async def get(self, session_id: str) -> dict[str, Any] | None:
        raw = await self._redis.get(session_id)
        return json.loads(raw) if raw else None

    async def set(self, session_id: str, key: str, value: Any):
        session = await self.get(session_id)
        if session is None:
            return
        session[key] = value
        await self._redis.set(session_id, json.dumps(session), ex=self.ttl)

    async def delete(self, session_id: str):
        await self._redis.delete(session_id)

    async def close(self):
        await self._redis.close()