"""Temporal workflows — orchestration only. Deterministic: no clock/random/IO
here; the retry delay is a durable ``workflow.sleep`` timer, not time.sleep."""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from temporal_app.activities import (
        place_call_activity,
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
        retry_on: list,
        retry_delay_minutes: int,
        max_attempts: int,
    ) -> dict:
        attempt = 0
        while True:
            attempt += 1
            res = await workflow.execute_activity(
                place_call_activity,
                args=[contact_id, campaign_id, attempt],
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RetryPolicy(maximum_attempts=2),  # transient API errors only
            )
            outcome = res["outcome"]

            if should_retry(outcome, attempt, retry_on, max_attempts):
                retry_seconds = retry_delay_minutes * 60
                await workflow.execute_activity(
                    update_contact_status_activity,
                    args=[contact_id, campaign_id, "retry_wait", attempt, outcome,
                          None, retry_seconds],
                    start_to_close_timeout=timedelta(seconds=30),
                )
                await workflow.sleep(timedelta(minutes=retry_delay_minutes))  # durable timer
                continue

            status = terminal_status(outcome, attempt, retry_on, max_attempts)
            await workflow.execute_activity(
                update_contact_status_activity,
                args=[contact_id, campaign_id, status, attempt, outcome,
                      res.get("result") or {}, None],
                start_to_close_timeout=timedelta(seconds=30),
            )
            res["attempts"] = attempt
            res["status"] = status
            return res
