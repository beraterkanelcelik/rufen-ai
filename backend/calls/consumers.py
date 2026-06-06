import os
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from redis.asyncio import Redis


class CallStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.job = self.scope["url_route"]["kwargs"]["job_id"]
        await self.accept()  # slice 1: open. Slice 5 adds token check → close(4401) if missing.
        self.redis = Redis.from_url(os.environ["REDIS_URL"])
        self.pubsub = self.redis.pubsub()
        await self.pubsub.subscribe(f"call:{self.job}")
        self.task = asyncio.create_task(self._listen())

    async def _listen(self):
        async for msg in self.pubsub.listen():
            if msg.get("type") == "message":
                data = msg["data"]
                await self.send(text_data=data.decode() if isinstance(data, bytes) else data)

    async def disconnect(self, code):
        if hasattr(self, "task"):
            self.task.cancel()
        try:
            await self.pubsub.unsubscribe()
            await self.redis.aclose()
        except Exception:
            pass
