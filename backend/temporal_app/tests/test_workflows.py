"""Slice 2 verification.

Pure helper tests need no server. The integration tests use Temporal's
time-skipping test environment with MOCKED activities — so the durable retry
timer (workflow.sleep) is fast-forwarded and no real phone call is placed. This
is the automated stand-in for the phone-blocked manual verify (plan §2.4).
"""
import asyncio
import os

import pytest
from temporalio import activity
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

# The time-skipping env downloads a test-server binary on first use, which hangs
# in an offline container. Opt in explicitly where the binary is reachable:
#   RUN_TEMPORAL_INTEGRATION=1 pytest temporal_app/tests/test_workflows.py
integration = pytest.mark.skipif(
    not os.environ.get("RUN_TEMPORAL_INTEGRATION"),
    reason="set RUN_TEMPORAL_INTEGRATION=1 to run Temporal time-skipping tests",
)

from temporal_app.workflows import (
    ContactCallWorkflow,
    should_retry,
    terminal_status,
)

RETRY_ON = ["no_answer", "busy", "failed"]


# --------------------------- pure helpers (no server) --------------------------
def test_should_retry_when_retryable_and_attempts_left():
    assert should_retry("no_answer", 1, RETRY_ON, 3) is True


def test_should_retry_false_when_exhausted():
    assert should_retry("no_answer", 3, RETRY_ON, 3) is False


def test_should_retry_false_when_not_retryable():
    assert should_retry("answered", 1, RETRY_ON, 3) is False


def test_terminal_status_answered_is_completed():
    assert terminal_status("answered", 1, RETRY_ON, 3) == "completed"


def test_terminal_status_retryable_exhausted_is_exhausted():
    assert terminal_status("no_answer", 3, RETRY_ON, 3) == "exhausted"


def test_terminal_status_nonretryable_is_failed():
    assert terminal_status("failed", 1, ["no_answer"], 3) == "failed"


def test_terminal_status_declined_is_completed():
    assert terminal_status("declined", 1, RETRY_ON, 3) == "completed"


# ------------------------ workflow integration (time-skip) ---------------------
async def _run_with_outcomes(outcomes, max_attempts=3, retry_delay_minutes=60, wf_id="wf"):
    """Run ContactCallWorkflow with a scripted sequence of call outcomes."""
    seq = iter(outcomes)
    calls = []
    updates = []

    @activity.defn(name="place_call_activity")
    async def fake_place(contact_id: int, campaign_id: int, attempt_no: int,
                         agent_id: str = "") -> dict:
        calls.append(attempt_no)
        return {"conversation_id": f"conv-{attempt_no}", "outcome": next(seq),
                "transcript": [], "result": {"agreed_to_book": True}}

    @activity.defn(name="update_contact_status_activity")
    async def fake_update(contact_id: int, campaign_id: int, status: str, attempts: int,
                          last_outcome: str, result: dict = None,
                          retry_seconds: int = None) -> None:
        updates.append({"status": status, "attempts": attempts,
                        "retry_seconds": retry_seconds})

    try:
        env_cm = await asyncio.wait_for(WorkflowEnvironment.start_time_skipping(), timeout=30)
    except Exception as exc:  # test-server binary unavailable (e.g. offline CI)
        pytest.skip(f"Temporal time-skipping server unavailable: {exc}")

    async with env_cm as env:
        async with Worker(env.client, task_queue="test-q",
                          workflows=[ContactCallWorkflow],
                          activities=[fake_place, fake_update]):
            res = await env.client.execute_workflow(
                ContactCallWorkflow.run,
                args=[1, 1, "agent-test", RETRY_ON, retry_delay_minutes, max_attempts],
                id=wf_id, task_queue="test-q",
            )
    return res, calls, updates


@integration
@pytest.mark.asyncio
async def test_workflow_retries_then_succeeds():
    res, calls, updates = await _run_with_outcomes(
        ["no_answer", "answered"], wf_id="wf-retry-success")
    assert calls == [1, 2]  # placed twice
    assert res["attempts"] == 2
    assert res["outcome"] == "answered"
    assert res["status"] == "completed"
    # exactly one retry_wait, with a 60-minute (3600s) durable countdown
    retry_waits = [u for u in updates if u["status"] == "retry_wait"]
    assert len(retry_waits) == 1 and retry_waits[0]["retry_seconds"] == 3600
    assert updates[-1]["status"] == "completed"


@integration
@pytest.mark.asyncio
async def test_workflow_exhausts_after_max_attempts():
    res, calls, updates = await _run_with_outcomes(
        ["no_answer", "no_answer"], max_attempts=2, wf_id="wf-exhaust")
    assert calls == [1, 2]
    assert res["attempts"] == 2
    assert res["status"] == "exhausted"
    assert updates[-1]["status"] == "exhausted"


@integration
@pytest.mark.asyncio
async def test_workflow_no_retry_on_answered_first_try():
    res, calls, updates = await _run_with_outcomes(
        ["answered"], wf_id="wf-first-try")
    assert calls == [1]
    assert res["status"] == "completed"
    assert not any(u["status"] == "retry_wait" for u in updates)


@integration
@pytest.mark.asyncio
async def test_campaign_workflow_fans_out_and_finalizes():
    from temporal_app.workflows import CampaignWorkflow

    placed, finalized = [], []

    @activity.defn(name="place_call_activity")
    async def fake_place(contact_id: int, campaign_id: int, attempt_no: int,
                         agent_id: str = "") -> dict:
        placed.append((contact_id, agent_id))
        return {"conversation_id": "c", "outcome": "answered", "transcript": [], "result": {}}

    @activity.defn(name="update_contact_status_activity")
    async def fake_update(contact_id: int, campaign_id: int, status: str, attempts: int,
                          last_outcome: str, result: dict = None, retry_seconds: int = None) -> None:
        pass

    @activity.defn(name="finalize_campaign_activity")
    async def fake_finalize(campaign_id: int) -> None:
        finalized.append(campaign_id)

    try:
        env_cm = await asyncio.wait_for(WorkflowEnvironment.start_time_skipping(), timeout=30)
    except Exception as exc:
        pytest.skip(f"Temporal time-skipping server unavailable: {exc}")

    async with env_cm as env:
        async with Worker(env.client, task_queue="test-q",
                          workflows=[CampaignWorkflow, ContactCallWorkflow],
                          activities=[fake_place, fake_update, fake_finalize]):
            res = await env.client.execute_workflow(
                CampaignWorkflow.run,
                args=[1, [10, 11], 2, ["agentA", "agentB"], RETRY_ON, 60, 3],
                id="campaign-test-1", task_queue="test-q",
            )
    assert res["contacts"] == 2
    assert sorted(c for c, _ in placed) == [10, 11]
    # each parallel contact got a DISTINCT agent from the pool
    assert {a for _, a in placed} == {"agentA", "agentB"}
    assert finalized == [1]
