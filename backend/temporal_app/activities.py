"""Temporal activities — all side-effecting IO lives here (never in workflows).

Gotchas honoured:
  • Activities run in a worker thread pool → call ``close_old_connections()`` at
    the top of each DB-touching activity so a long-lived worker never reuses a
    dropped Postgres connection. (No multi-tenancy here, so there's no tenant
    context to set — but this is where it would go.)
  • Publish live frames with a RAW redis client (not the Django cache, which
    prefixes keys) to the ``campaign:{id}`` channel.
  • Frames are emitted in the FRONTEND's contract shape so the Slice-3 consumer
    forwards them verbatim:
        {type:"transcript",     contactId, role:"agent"|"callee", text}
        {type:"contact_status", contactId, status, attempts, last_outcome}
        {type:"retry_countdown",contactId, secondsRemaining}
        {type:"result",         contactId, result}
"""
import asyncio
import json
import os

from asgiref.sync import sync_to_async
from redis.asyncio import Redis
from temporalio import activity

from campaigns.eleven import get_conversation, start_call
from campaigns.outcomes import classify_outcome

# Stop polling a single call after this many seconds (voicemail / hung call guard).
MAX_CALL_SECONDS = 180
POLL_INTERVAL_SECONDS = 1


def _channel(campaign_id) -> str:
    return f"campaign:{campaign_id}"


async def _publish(redis: Redis, campaign_id, frame: dict) -> None:
    await redis.publish(_channel(campaign_id), json.dumps(frame))


def _extract_results(conversation: dict) -> dict:
    """ElevenLabs returns data_collection_results as {key: {value, rationale, ...}}.
    Flatten to {key: value} for storage + the UI."""
    raw = (conversation.get("analysis") or {}).get("data_collection_results") or {}
    return {k: (v.get("value") if isinstance(v, dict) else v) for k, v in raw.items()}


@sync_to_async
def _load_contact_and_campaign(contact_id, campaign_id):
    from django.db import close_old_connections

    from campaigns.models import Campaign, CampaignContact

    close_old_connections()
    contact = CampaignContact.objects.get(id=contact_id)
    campaign = Campaign.objects.get(id=campaign_id)
    return (
        {"name": contact.name, "phone": contact.phone, "context": contact.context,
         "last_outcome": contact.last_outcome or None},
        {"eleven_agent_id": campaign.eleven_agent_id},
    )


@sync_to_async
def _open_attempt(contact_id, attempt_no):
    """Write the CallAttempt row BEFORE originating (pitfall: never lose a call)."""
    from django.db import close_old_connections
    from django.utils import timezone

    from campaigns.models import CallAttempt, CampaignContact

    close_old_connections()
    attempt = CallAttempt.objects.create(
        contact_id=contact_id, attempt_no=attempt_no, started_at=timezone.now()
    )
    CampaignContact.objects.filter(id=contact_id).update(
        status="calling", attempts=attempt_no
    )
    return attempt.id


@sync_to_async
def _close_attempt(attempt_id, contact_id, conversation_id, outcome, transcript):
    from django.db import close_old_connections
    from django.utils import timezone

    from campaigns.models import CallAttempt, CampaignContact

    close_old_connections()
    CallAttempt.objects.filter(id=attempt_id).update(
        conversation_id=conversation_id or "",
        outcome=outcome,
        transcript=transcript,
        ended_at=timezone.now(),
    )
    CampaignContact.objects.filter(id=contact_id).update(last_outcome=outcome)


@activity.defn
async def place_call_activity(contact_id: int, campaign_id: int, attempt_no: int,
                              agent_id: str = "") -> dict:
    """Place one outbound call, stream transcript to Redis, return the outcome.

    ``agent_id`` is the ElevenLabs agent to use for THIS call (one agent per
    concurrency slot — ElevenLabs caps 1 concurrent call per agent). Falls back to
    the campaign's primary agent. Returns {conversation_id, outcome, transcript, result}.
    """
    contact, campaign = await _load_contact_and_campaign(contact_id, campaign_id)
    use_agent = agent_id or campaign["eleven_agent_id"]
    attempt_id = await _open_attempt(contact_id, attempt_no)

    redis = Redis.from_url(os.environ["REDIS_URL"])
    cid_str = str(contact_id)
    try:
        # tell the monitor this contact is now ringing
        await _publish(redis, campaign_id, {
            "type": "contact_status", "contactId": cid_str, "status": "calling",
            "attempts": attempt_no, "last_outcome": contact["last_outcome"],
        })

        # bind the contact's own data so the agent already knows it (it's calling
        # them — it must never ask the customer to read out their own number).
        dyn = {
            "name": contact["name"],
            "context": contact["context"] or "",
            "phone": contact["phone"],
        }
        res = await start_call(use_agent, contact["phone"], dyn)
        conversation_id = res["conversation_id"]

        seen = 0
        status = "initiated"
        transcript = []
        data = {}
        elapsed = 0
        while status not in ("done", "failed") and elapsed < MAX_CALL_SECONDS:
            try:
                data = await get_conversation(conversation_id)
            except Exception:
                # transient HTTP blip while polling — keep the call alive, retry
                # next tick rather than failing the activity (which would re-dial).
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                elapsed += POLL_INTERVAL_SECONDS
                continue
            status = data.get("status")
            transcript = data.get("transcript") or []
            for turn in transcript[seen:]:
                role = "callee" if turn.get("role") == "user" else "agent"
                await _publish(redis, campaign_id, {
                    "type": "transcript", "contactId": cid_str,
                    "role": role, "text": turn.get("message") or "",
                })
            seen = len(transcript)
            if status in ("done", "failed"):
                break
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            elapsed += POLL_INTERVAL_SECONDS

        outcome = classify_outcome(status, transcript)
        result = _extract_results(data)

        normalized = [
            {"role": t.get("role"), "text": t.get("message"),
             "time_in_call_secs": t.get("time_in_call_secs")}
            for t in transcript
        ]
        await _close_attempt(attempt_id, contact_id, conversation_id, outcome, normalized)

        return {"conversation_id": conversation_id, "outcome": outcome,
                "transcript": normalized, "result": result}
    finally:
        await redis.aclose()


@sync_to_async
def _persist_contact(contact_id, status, attempts, last_outcome, result):
    from django.db import close_old_connections

    from campaigns.models import CampaignContact

    close_old_connections()
    fields = {"status": status, "attempts": attempts, "last_outcome": last_outcome}
    if result is not None:
        fields["result"] = result
    CampaignContact.objects.filter(id=contact_id).update(**fields)


@sync_to_async
def _finalize_campaign(campaign_id):
    from django.db import close_old_connections
    from django.utils import timezone

    from campaigns.models import Campaign

    close_old_connections()
    Campaign.objects.filter(id=campaign_id).update(
        status="completed", finished_at=timezone.now()
    )


@sync_to_async
def _send_confirmation(contact_id, campaign_id):
    from django.db import close_old_connections

    from campaigns.models import Campaign, CampaignContact
    from campaigns.sms import compose_confirmation, send_sms, sms_enabled

    close_old_connections()
    campaign = Campaign.objects.get(id=campaign_id)
    if not sms_enabled() or not campaign.send_sms:  # per-campaign toggle + env gate
        return False
    contact = CampaignContact.objects.get(id=contact_id)
    ok = send_sms(contact.phone, compose_confirmation(contact, campaign))
    if ok:
        CampaignContact.objects.filter(id=contact_id).update(sms_sent=True)
    return ok


@activity.defn
async def send_confirmation_sms_activity(contact_id: int, campaign_id: int) -> bool:
    """Best-effort SMS confirmation after a successful (answered) call. Honors the
    campaign's send_sms toggle; on success persists sms_sent + notifies the monitor."""
    sent = await _send_confirmation(contact_id, campaign_id)
    if sent:
        redis = Redis.from_url(os.environ["REDIS_URL"])
        try:
            await _publish(redis, campaign_id,
                           {"type": "sms_sent", "contactId": str(contact_id)})
        finally:
            await redis.aclose()
    return sent


@activity.defn
async def finalize_campaign_activity(campaign_id: int) -> None:
    """Mark the campaign completed and tell the monitor."""
    await _finalize_campaign(campaign_id)
    redis = Redis.from_url(os.environ["REDIS_URL"])
    try:
        await _publish(redis, campaign_id, {"type": "campaign_status", "status": "completed"})
    finally:
        await redis.aclose()


@activity.defn
async def update_contact_status_activity(
    contact_id: int,
    campaign_id: int,
    status: str,
    attempts: int,
    last_outcome: str,
    result: dict = None,
    retry_seconds: int = None,
) -> None:
    """Persist a contact's status transition and emit the matching monitor frames."""
    await _persist_contact(contact_id, status, attempts, last_outcome, result)

    redis = Redis.from_url(os.environ["REDIS_URL"])
    cid_str = str(contact_id)
    try:
        await _publish(redis, campaign_id, {
            "type": "contact_status", "contactId": cid_str, "status": status,
            "attempts": attempts, "last_outcome": last_outcome,
        })
        if retry_seconds:
            await _publish(redis, campaign_id, {
                "type": "retry_countdown", "contactId": cid_str,
                "secondsRemaining": retry_seconds,
            })
        if result is not None:
            await _publish(redis, campaign_id, {
                "type": "result", "contactId": cid_str, "result": result,
            })
    finally:
        await redis.aclose()
