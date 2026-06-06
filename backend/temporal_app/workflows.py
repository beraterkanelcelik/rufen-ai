"""Temporal workflows — orchestration only. Deterministic: no clock/random/IO
here; the retry delay is a durable ``asyncio.sleep`` timer, not time.sleep."""
import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

with workflow.unsafe.imports_passed_through():
    from temporal_app.activities import (
        finalize_campaign_activity,
        place_call_activity,
        send_confirmation_sms_activity,
        update_contact_status_activity,
    )

# Outcomes that mean "stop, we reached a conclusion" regardless of retry settings.
TERMINAL_SUCCESS = {"answered", "declined", "wrong_number"}


def should_retry(outcome, attempt, retry_on, max_attempts) -> bool:
    """Pure decision: retry only if the outcome is retryable and attempts remain."""
    return outcome in retry_on and attempt < max_attempts


def terminal_status(outcome, attempt, retry_on, max_attempts) -> str:
    """Pure mapping of a final outcome to a ContactStatus the frontend expects:
    completed | failed | exhausted."""
    if outcome in TERMINAL_SUCCESS:
        return "completed"
    if outcome in retry_on and attempt >= max_attempts:
        return "exhausted"  # ran out of retries on a retryable outcome
    return "failed"


@workflow.defn
class ContactCallWorkflow:
    @workflow.run
    async def run(
        self,
        contact_id: int,
        campaign_id: int,
        agent_id: str,
        attempt: int,
        retry_on: list,
        retry_delay_minutes: int,
        max_attempts: int,
    ) -> dict:
        """ONE call attempt. The parent owns the retry delay so the concurrency
        slot (agent) is freed while a contact waits to be retried — a no-answer no
        longer blocks the rest of the campaign. Returns ``retry=True`` to ask the
        parent to wait then re-run; otherwise the contact is terminal."""
        try:
            res = await workflow.execute_activity(
                place_call_activity,
                args=[contact_id, campaign_id, attempt, agent_id],
                # must exceed MAX_CALL_SECONDS (600s) so Temporal never kills a
                # genuinely long call while it's still polling the transcript.
                start_to_close_timeout=timedelta(minutes=11),
                # NO Temporal auto-retry: re-running this activity would place a
                # SECOND real call. A failed dial is caught below and handled by
                # the outcome-level retry (a fresh, delayed attempt) instead.
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
        except ActivityError:
            # Dial failed (e.g. telephony not configured yet) — treat as a
            # failed outcome so the contact still finalizes instead of hanging.
            res = {"conversation_id": "", "outcome": "failed",
                   "transcript": [], "result": {}}
        outcome = res["outcome"]
        res["attempts"] = attempt

        if should_retry(outcome, attempt, retry_on, max_attempts):
            retry_seconds = retry_delay_minutes * 60
            await workflow.execute_activity(
                update_contact_status_activity,
                args=[contact_id, campaign_id, "retry_wait", attempt, outcome,
                      None, retry_seconds],
                start_to_close_timeout=timedelta(seconds=30),
            )
            res["retry"] = True
            return res

        status = terminal_status(outcome, attempt, retry_on, max_attempts)
        await workflow.execute_activity(
            update_contact_status_activity,
            args=[contact_id, campaign_id, status, attempt, outcome,
                  res.get("result") or {}, None],
            start_to_close_timeout=timedelta(seconds=30),
        )
        # confirmation SMS on a successful (answered) call — best-effort
        if status == "completed":
            try:
                await workflow.execute_activity(
                    send_confirmation_sms_activity,
                    args=[contact_id, campaign_id],
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except Exception:
                pass  # SMS failure must never affect the call outcome

        res["retry"] = False
        res["status"] = status
        return res


@workflow.defn
class CampaignWorkflow:
    """Fan out over a campaign's contacts, ≤ ``concurrency`` calls in flight, then
    finalize the campaign. Each contact is an independent child workflow so a
    single failure never sinks the campaign (return_exceptions=True)."""

    @workflow.run
    async def run(
        self,
        campaign_id: int,
        contact_ids: list,
        concurrency: int,
        agent_ids: list,
        retry_on: list,
        retry_delay_minutes: int,
        max_attempts: int,
    ) -> dict:
        concurrency = max(1, int(concurrency))
        pool = agent_ids or [""]  # one agent per concurrency slot (ElevenLabs: 1 call/agent)

        # Rolling concurrency (NOT fixed batches): an agent queue doubles as the
        # concurrency limiter and the per-call agent allocator. A contact grabs a
        # free agent, runs its whole call lifecycle, then returns the agent so the
        # next waiting contact starts IMMEDIATELY — one slow/retrying call no longer
        # blocks everyone behind it (the old batch-barrier bug).
        agents: asyncio.Queue = asyncio.Queue()
        for a in pool:
            agents.put_nowait(a)

        async def run_contact(cid):
            attempt = 0
            while True:
                attempt += 1
                agent = await agents.get()  # blocks until a slot/agent is free
                try:
                    res = await workflow.execute_child_workflow(
                        ContactCallWorkflow.run,
                        args=[cid, campaign_id, agent, attempt,
                              retry_on, retry_delay_minutes, max_attempts],
                        id=f"contact-{campaign_id}-{cid}-{attempt}",
                    )
                finally:
                    agents.put_nowait(agent)  # free the slot BEFORE any retry wait
                if not (res or {}).get("retry"):
                    break
                # wait out the retry delay WITHOUT holding an agent, so other
                # contacts keep dialing (durable timer via patched asyncio.sleep).
                await asyncio.sleep(retry_delay_minutes * 60)

        await asyncio.gather(*[run_contact(cid) for cid in contact_ids],
                             return_exceptions=True)

        await workflow.execute_activity(
            finalize_campaign_activity,
            args=[campaign_id],
            start_to_close_timeout=timedelta(seconds=30),
        )
        return {"campaign_id": campaign_id, "contacts": len(contact_ids)}
