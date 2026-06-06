"""Live monitor WebSocket. Subscribes (raw redis) to ``campaign:{id}`` and
forwards every frame to the browser verbatim — the activities already publish in
the frontend's LiveEvent shape. The consumer also acts as the AGGREGATOR: it
sends an aggregate snapshot on connect and recomputes one after each
contact_status frame, so the dashboard counters stay correct without the
workflow having to compute them.
"""
import json
import os

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from redis.asyncio import Redis

TERMINAL = ("completed", "failed", "exhausted")


class CampaignMonitorConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.campaign_id = self.scope["url_route"]["kwargs"]["campaign_id"]
        # mocked auth: require a non-empty ?token=
        qs = (self.scope.get("query_string") or b"").decode()
        token = dict(p.split("=", 1) for p in qs.split("&") if "=" in p).get("token")
        if not token:
            await self.close(code=4401)
            return

        await self.accept()
        self._redis = Redis.from_url(os.environ["REDIS_URL"])
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(f"campaign:{self.campaign_id}")
        self._task = None
        import asyncio
        self._task = asyncio.create_task(self._reader())

        # initial snapshot so a late joiner sees current state + counters
        for frame in await self._snapshot():
            await self.send(text_data=json.dumps(frame))

    async def disconnect(self, code):
        task = getattr(self, "_task", None)
        if task:
            task.cancel()
        pubsub = getattr(self, "_pubsub", None)
        if pubsub:
            try:
                await pubsub.unsubscribe(f"campaign:{self.campaign_id}")
                await pubsub.aclose()
            except Exception:
                pass
        redis = getattr(self, "_redis", None)
        if redis:
            await redis.aclose()

    async def _reader(self):
        async for message in self._pubsub.listen():
            if message.get("type") != "message":
                continue
            data = message["data"]
            text = data.decode() if isinstance(data, bytes) else data
            await self.send(text_data=text)
            # keep aggregate counters fresh whenever a status changes
            try:
                if json.loads(text).get("type") == "contact_status":
                    await self.send(text_data=json.dumps(await self._aggregate()))
            except Exception:
                pass

    async def _snapshot(self):
        frames = await self._contact_status_frames()
        frames.append(await self._aggregate())
        return frames

    @database_sync_to_async
    def _contact_status_frames(self):
        from .models import CampaignContact

        frames = []
        for c in CampaignContact.objects.filter(campaign_id=self.campaign_id):
            frames.append({
                "type": "contact_status", "contactId": str(c.id),
                "status": c.status, "attempts": c.attempts,
                "last_outcome": c.last_outcome or None,
            })
            if c.result:
                frames.append({"type": "result", "contactId": str(c.id), "result": c.result})
        return frames

    @database_sync_to_async
    def _aggregate(self):
        from .models import CampaignContact

        counts = {k: 0 for k in
                  ("pending", "calling", "retry_wait", "completed", "failed", "exhausted")}
        total = 0
        for c in CampaignContact.objects.filter(campaign_id=self.campaign_id):
            total += 1
            if c.status in counts:
                counts[c.status] += 1
        finished = counts["completed"] + counts["failed"] + counts["exhausted"]
        success_rate = (counts["completed"] / finished) if finished else 0
        return {"type": "aggregate", **counts, "total": total, "successRate": success_rate}
