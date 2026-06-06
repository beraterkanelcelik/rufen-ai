"""Temporal worker — Django-bootstrapped.

Slice 1: a minimal worker that bootstraps Django, connects to Temporal, and
runs on the ``campaigns`` task queue with a single ``ping`` activity. This makes
the ``temporal-worker`` service boot cleanly and proves connectivity to the
Temporal dev server today.

Slice 2+ registers the real activities (place_call_activity) and workflows
(ContactCallWorkflow, CampaignWorkflow) here.
"""
import asyncio
import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()  # must run before importing anything that touches models

from temporalio import activity
from temporalio.client import Client
from temporalio.worker import Worker

TASK_QUEUE = "campaigns"


@activity.defn
async def ping() -> str:
    """Placeholder activity so the worker has something to register (Slice 1)."""
    return "pong"


async def _connect_with_retry() -> Client:
    host = os.environ.get("TEMPORAL_HOST", "temporal:7233")
    namespace = os.environ.get("TEMPORAL_NAMESPACE", "rufen")
    last_err = None
    for attempt in range(1, 31):
        try:
            return await Client.connect(host, namespace=namespace)
        except Exception as err:  # dev server may not be ready yet on cold boot
            last_err = err
            print(f"[worker] Temporal not ready (attempt {attempt}/30): {err}")
            await asyncio.sleep(2)
    raise RuntimeError(f"Could not connect to Temporal at {host}: {last_err}")


async def main():
    client = await _connect_with_retry()
    print(f"[worker] connected; serving task queue '{TASK_QUEUE}'")
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[],
        activities=[ping],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
