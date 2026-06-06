import os
import asyncio
import json
from redis.asyncio import Redis
from .eleven import get_conversation


def diff_new_turns(turns, seen_count):
    """Return the turns not yet seen plus the new total count.

    `turns` is the full transcript list from ElevenLabs (grows monotonically while
    the call is in-progress). `seen_count` is how many we've already published.
    """
    new = turns[seen_count:]
    return new, len(turns)


ROLE_MAP = {"user": "callee", "agent": "agent"}


async def poll_conversation(conversation_id, channel):
    redis = Redis.from_url(os.environ["REDIS_URL"])
    seen = 0
    try:
        while True:
            data = await get_conversation(conversation_id)
            status = data.get("status")
            new, seen = diff_new_turns(data.get("transcript") or [], seen)
            for t in new:
                await redis.publish(channel, json.dumps({
                    "task_id": conversation_id,
                    "type": "transcript",
                    "role": ROLE_MAP.get(t.get("role"), t.get("role")),
                    "text": t.get("message"),
                }))
            await redis.publish(channel, json.dumps({
                "task_id": conversation_id,
                "type": "status",
                "status": status,
            }))
            if status in ("done", "failed"):
                break
            await asyncio.sleep(1)
    finally:
        await redis.aclose()
