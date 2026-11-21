import asyncio
import json


class EventBus:
    """Publish/subscribe for live agent status. Uses Redis pub/sub when it is up, otherwise in-process queues.
    shortcut: the in-process path only reaches subscribers in the same process, so use a single worker without Redis."""

    def __init__(self, link):
        self._link = link  # services.redis.redis_client.RedisLink
        self._local: dict[str, set[asyncio.Queue]] = {}

    async def publish(self, channel: str, payload: dict):
        data = json.dumps(payload)
        # Always hand it to in-process subscribers (those that joined while Redis was down); a subscriber
        # on Redis pub/sub is not in this set, so nobody gets it twice.
        for queue in list(self._local.get(channel, ())):
            queue.put_nowait(data)
        if await self._link.ensure():
            try:
                await self._link.client.publish(channel, data)
            except Exception as e:
                self._link.mark_down(e)

    async def subscribe(self, channel: str, idle_seconds: float = 15.0):
        """Yield each payload as a JSON string, and None after `idle_seconds` of silence (the caller sends a keep-alive).
        If Redis fails mid-stream the generator ends; the browser's EventSource then reconnects and joins in-process."""
        if await self._link.ensure():
            pubsub = self._link.client.pubsub()
            try:
                await pubsub.subscribe(channel)
            except Exception as e:
                self._link.mark_down(e)
                pubsub = None
            if pubsub is not None:
                try:
                    while True:
                        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=idle_seconds)
                        if msg is None:
                            yield None
                            continue
                        data = msg.get("data")
                        yield data.decode("utf-8") if isinstance(data, bytes) else data
                except Exception as e:  # not CancelledError/GeneratorExit, which must pass through
                    self._link.mark_down(e)
                    return
                finally:
                    try:
                        await pubsub.unsubscribe(channel)
                        await pubsub.aclose()
                    except Exception:
                        pass

        queue: asyncio.Queue = asyncio.Queue()
        self._local.setdefault(channel, set()).add(queue)
        try:
            while True:
                try:
                    yield await asyncio.wait_for(queue.get(), idle_seconds)
                except asyncio.TimeoutError:
                    yield None
        finally:
            queues = self._local.get(channel)
            if queues is not None:
                queues.discard(queue)
                if not queues:
                    del self._local[channel]


if __name__ == "__main__":
    from contextlib import aclosing
    from services.redis.redis_client import RedisLink

    async def main():
        link = RedisLink("redis://127.0.0.1:1/0", cooldown=3600)  # nothing listens: in-process path
        bus = EventBus(link)
        await bus.publish("c", {"n": 0})  # nobody subscribed: dropped, must not fail

        async def take(n):
            got = []
            async with aclosing(bus.subscribe("c", idle_seconds=0.05)) as sub:
                async for item in sub:
                    if item is not None:
                        got.append(json.loads(item))
                    if len(got) == n:
                        return got

        first, second = asyncio.create_task(take(2)), asyncio.create_task(take(2))
        await asyncio.sleep(0.1)  # let both subscribe (and see an idle None)
        await bus.publish("c", {"n": 1})
        await bus.publish("c", {"n": 2})
        assert await first == [{"n": 1}, {"n": 2}] and await second == [{"n": 1}, {"n": 2}]
        assert "c" not in bus._local, "subscriber queues must be cleaned up"
        await link.close()
        print("OK: EventBus in-process self-check passed")

    asyncio.run(main())
