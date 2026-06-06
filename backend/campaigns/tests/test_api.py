"""E2E API tests: create → list → detail → contacts → launch, hitting the real
DRF stack + Postgres. Shapes must match the frontend's TypeScript types."""
import pytest
from rest_framework.test import APIClient

BASE_PAYLOAD = {
    "name": "Test Campaign",
    "goal": "Book appointments",
    "reason": "Recall",
    "script_prompt": "You are calling {name}.",
    "first_message": "Hi {name}.",
    "extraction_schema": [{"key": "agreed", "type": "boolean", "desc": "Agreed?"}],
    "voice_id": "voice_rachel",
    "language": "en",
    "concurrency": 2,
    "retry_delay_minutes": 30,
    "max_attempts": 3,
    "retry_on": ["no_answer", "busy", "failed"],
}


@pytest.mark.django_db
def test_create_campaign_with_contacts_then_read():
    client = APIClient()
    payload = {**BASE_PAYLOAD, "contacts": [
        {"name": "Alice", "phone": "+4915112345670", "context": "X5", "language": "en"},
        {"name": "Bob", "phone": "+4915112345671", "context": "", "language": "en"},
    ]}
    r = client.post("/api/campaigns", payload, format="json")
    assert r.status_code == 201, r.content
    body = r.json()
    cid = body["id"]
    assert isinstance(cid, str)
    assert body["contact_count"] == 2
    assert body["status"] == "draft"

    # list includes it
    listed = client.get("/api/campaigns").json()
    assert any(c["id"] == cid for c in listed)

    # detail carries done_count + extraction schema
    detail = client.get(f"/api/campaigns/{cid}").json()
    assert detail["name"] == "Test Campaign"
    assert detail["done_count"] == 0
    assert detail["extraction_schema"][0]["key"] == "agreed"

    # contacts: string ids, last_outcome null, e164 phone
    contacts = client.get(f"/api/campaigns/{cid}/contacts").json()
    assert len(contacts) == 2
    assert isinstance(contacts[0]["id"], str)
    assert contacts[0]["campaign_id"] == cid
    assert contacts[0]["last_outcome"] is None
    assert contacts[0]["phone"].startswith("+49")


@pytest.mark.django_db
def test_launch_sets_running():
    client = APIClient()
    cid = client.post("/api/campaigns", {**BASE_PAYLOAD, "contacts": []},
                      format="json").json()["id"]
    r = client.post(f"/api/campaigns/{cid}/launch")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "running"
    assert body["started_at"] is not None
    assert "telephony_ready" in body


@pytest.mark.django_db
def test_patch_campaign_edits_fields():
    client = APIClient()
    cid = client.post("/api/campaigns", {**BASE_PAYLOAD, "contacts": []},
                      format="json").json()["id"]
    r = client.patch(f"/api/campaigns/{cid}", {"name": "Renamed", "concurrency": 1},
                     format="json")
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert r.json()["concurrency"] == 1
