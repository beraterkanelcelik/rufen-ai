"""E2E WebSocket test: the monitor consumer rejects anon connections, sends an
aggregate snapshot on connect, and forwards frames published to the real Redis
channel. Exercises the full Redis pub/sub → Channels → client path."""
import json
import os

import pytest
from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from redis.asyncio import Redis

from campaigns.routing import websocket_urlpatterns


def _app():
    return URLRouter(websocket_urlpatterns)


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_ws_rejects_without_token():
    comm = WebsocketCommunicator(_app(), "/ws/campaign/123/")
    connected, _ = await comm.connect()
    assert connected is False
    await comm.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_ws_snapshot_and_forwarding():
    from campaigns.models import Campaign

    campaign = await database_sync_to_async(Campaign.objects.create)(name="WS Test")
    comm = WebsocketCommunicator(_app(), f"/ws/campaign/{campaign.id}/?token=mock")
    connected, _ = await comm.connect()
    assert connected is True

    # snapshot on connect = an aggregate frame (no contacts → all zero)
    snapshot = await comm.receive_json_from(timeout=5)
    assert snapshot["type"] == "aggregate"
    assert snapshot["total"] == 0

    # publishing to the real channel is forwarded verbatim
    r = Redis.from_url(os.environ["REDIS_URL"])
    await r.publish(
        f"campaign:{campaign.id}",
        json.dumps({"type": "transcript", "contactId": "1", "role": "agent", "text": "hello"}),
    )
    await r.aclose()

    frame = await comm.receive_json_from(timeout=5)
    assert frame["type"] == "transcript"
    assert frame["text"] == "hello"
    assert frame["role"] == "agent"

    await comm.disconnect()
