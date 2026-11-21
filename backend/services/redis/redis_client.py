import time

import redis.asyncio as redis
from dotenv import load_dotenv
import os

load_dotenv()

DEFAULT_REDIS_URL = "redis://redis:6379/0"
COOLDOWN_SECONDS = 30  # after a failure, don't touch Redis again for this long
CONNECT_TIMEOUT = 2  # seconds; keeps an unreachable Redis from stalling a request

async def get_redis_client(decode_responses: bool = True) -> redis.Redis:
    redis_url = os.getenv("REDIS_URL", DEFAULT_REDIS_URL)
    
    redis_client = redis.from_url(redis_url, decode_responses=decode_responses)
    
    await redis_client.ping()  # Test the connection
    
    return redis_client


class RedisLink:
    """Redis is optional. The clients are lazy (nothing connects until first use); `ensure()` says
    whether Redis is usable right now, and callers fall back to in-process storage when it is not.
    After a failure it stays "down" for COOLDOWN_SECONDS, then the next `ensure()` pings again."""

    def __init__(self, url: str | None = None, cooldown: float = COOLDOWN_SECONDS):
        url = url or os.getenv("REDIS_URL", DEFAULT_REDIS_URL)
        # "localhost" resolves to ::1 first on Windows, and Docker publishes Redis on IPv4 only, so the
        # IPv6 attempt hangs until the connect timeout and Redis is wrongly reported as down.
        url = url.replace("://localhost:", "://127.0.0.1:").replace("@localhost:", "@127.0.0.1:")
        self.client = redis.from_url(url, decode_responses=True, socket_connect_timeout=CONNECT_TIMEOUT)
        # raw-bytes client: the decoded one would corrupt binary (thumbnail) data
        self.bytes_client = redis.from_url(url, decode_responses=False, socket_connect_timeout=CONNECT_TIMEOUT)
        self.cooldown = cooldown
        self.up = False
        self._retry_at = 0.0

    async def ensure(self) -> bool:
        if self.up:
            return True
        if time.monotonic() < self._retry_at:
            return False
        try:
            await self.client.ping()
        except Exception as e:
            self.mark_down(e)
            return False
        self.up = True
        print("Redis is available.")
        return True

    def mark_down(self, error: Exception | None = None):
        if self.up:
            print(f"Redis became unavailable, using the in-memory fallback: {error}")
        self.up = False
        self._retry_at = time.monotonic() + self.cooldown

    async def close(self):
        for client in (self.client, self.bytes_client):
            try:
                await client.aclose()
            except Exception:
                pass


if __name__ == "__main__":
    import asyncio

    async def main():
        link = RedisLink("redis://127.0.0.1:1/0", cooldown=0.2)  # nothing listens on port 1
        assert await link.ensure() is False and link.up is False
        pings = []
        real_ping = link.client.ping

        async def counting_ping():
            pings.append(1)
            return await real_ping()

        link.client.ping = counting_ping
        assert await link.ensure() is False and not pings, "must not re-ping during the cooldown"
        await asyncio.sleep(0.25)
        assert await link.ensure() is False and len(pings) == 1, "must ping again after the cooldown"
        await link.close()
        print("OK: RedisLink self-check passed")

    asyncio.run(main())
