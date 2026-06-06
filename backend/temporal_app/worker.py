"""Temporal worker — Django-bootstrapped.

Bootstraps Django (so activities can use the ORM), connects to the Temporal dev
server, and serves the ``campaigns`` task queue with the ContactCallWorkflow and
its activities. CampaignWorkflow (fan-out over contacts) is added in Slice 3.
"""
import asyncio
import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()  # must run before importing anything that touches models

from temporalio.client import Client
from temporalio.worker import Worker

from temporal_app.activities import (
    finalize_campaign_activity,
    place_call_activity,
    send_confirmation_sms_activity,
    update_contact_status_activity,
)
from temporal_app.workflows import CampaignWorkflow, ContactCallWorkflow

TASK_QUEUE = "campaigns"


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
        workflows=[ContactCallWorkflow, CampaignWorkflow],
        activities=[
            place_call_activity,
            update_contact_status_activity,
            finalize_campaign_activity,
            send_confirmation_sms_activity,
        ],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
