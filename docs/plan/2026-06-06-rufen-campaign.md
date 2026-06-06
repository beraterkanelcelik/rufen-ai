# Rufen Campaign — Implementation Plan

> **For agentic workers:** implement task-by-task; checkbox (`- [ ]`) steps. **Read `CLAUDE.md` + `docs/00-DESIGN.md` first.** Build fresh — never copy from `~/Projects/Rufen`.

**Goal:** Upload an Excel of customers → wizard (AI-drafted script) → Temporal runs concurrency-capped calls with delay+max-attempt retries → live monitor → structured results + CSV.

**Architecture:** Django + Channels (API + live monitor) and a **Temporal worker** (campaign/contact workflows). ElevenLabs Agents place the calls over Telnyx SIP; activities poll for transcript + outcome and publish to Redis for the monitor. Orchestration LLM (Claude/GPT) drafts the script.

**Tech Stack:** Django 5, DRF, Channels, channels-redis, Daphne, **temporalio**, httpx, redis, phonenumbers, openpyxl, anthropic/openai SDK, Postgres, React (UX track).

**Testing:** pure logic (phone normalize, outcome classify, generator JSON, CSV sanitize) = TDD unit tests. Call/workflow paths = explicit MANUAL VERIFY. Commit after each task.

**This plan is backend-first** — Slices 1–5 need zero UX. Slice 6 is the React wizard/dashboard (cofounder's designs).

---

## Slice 0 — Prereqs (manual)
- [ ] Finish **Telnyx SIP connection → import number into ElevenLabs** → set `ELEVEN_AGENT_PHONE_NUMBER_ID` in `.env`. (`docs/03-PREFLIGHT.md`.)
- [ ] Put your + teammate's **real phone numbers** into `examples/contacts_example.csv`.
- [ ] `.env` already has Temporal + keys. Confirm `ELEVENLABS_API_KEY` returns 200 on `/v1/convai/agents`.

---

## Slice 1 — Skeleton + models + Excel import + ONE real call

**DoD:** a Python call (mgmt command or test) places a real ElevenLabs call to a contact from the Excel, stores transcript + outcome.

**Files:** `docker-compose.yml`, `backend/{Dockerfile,requirements.txt,manage.py}`, `backend/config/{settings,asgi,urls}.py`, `backend/campaigns/{__init__,apps,models,eleven,importer,outcomes}.py`, `backend/campaigns/tests/{test_importer,test_outcomes}.py`, `examples/`.

- [ ] **1.1 `backend/requirements.txt`**
```
Django==5.0.6
djangorestframework==3.15.1
channels==4.1.0
channels-redis==4.2.0
daphne==4.1.2
temporalio==1.7.0
httpx==0.27.0
redis==5.0.4
psycopg[binary]==3.1.19
django-cors-headers==4.3.1
phonenumbers==8.13.40
openpyxl==3.1.2
anthropic==0.34.0
openai==1.40.0
```

- [ ] **1.2 `docker-compose.yml`** (root)
```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_DB: rufen, POSTGRES_USER: rufen, POSTGRES_PASSWORD: rufen }
    ports: ["127.0.0.1:5432:5432"]
  redis:
    image: redis:7
    ports: ["127.0.0.1:6379:6379"]
  temporal:
    image: temporalio/temporal:latest
    command: ["server","start-dev","--ip","0.0.0.0","--namespace","rufen","--db-filename","/data/t.db"]
    ports: ["7233:7233","8233:8233"]   # 8233 = Temporal UI
    volumes: ["temporaldata:/data"]
  web:
    build: ./backend
    command: daphne -b 0.0.0.0 -p 8000 config.asgi:application
    env_file: .env
    ports: ["8000:8000"]
    volumes: ["./backend:/app"]
    depends_on: [db, redis, temporal]
  temporal-worker:
    build: ./backend
    command: python -m temporal_app.worker
    env_file: .env
    volumes: ["./backend:/app"]
    depends_on: [db, redis, temporal]
volumes: { temporaldata: {} }
```
> The worker module is `temporal_app` (a top-level package in `backend/`) to avoid clashing with the `temporalio` SDK name. Create `backend/temporal_app/__init__.py`.

- [ ] **1.3 Django project** — `Dockerfile` (python:3.12-slim, pip install -r, CMD daphne), `manage.py`, `config/settings.py` (INSTALLED_APPS: daphne, channels, rest_framework, corsheaders, campaigns; ASGI_APPLICATION; CHANNEL_LAYERS→redis; DATABASES→db; CORS_ALLOW_ALL_ORIGINS=True; STATICFILES_DIRS=[static]), `config/asgi.py` (ProtocolTypeRouter http+websocket→`campaigns.routing.websocket_urlpatterns`), `config/urls.py` (include `campaigns.api` router + monitor TemplateView). Mirror the structure in `CLAUDE.md`.

- [ ] **1.4 `campaigns/models.py`** — exactly the schema in `docs/00-DESIGN.md §4` (Campaign, CampaignContact, CallAttempt). Run `makemigrations campaigns && migrate`.

- [ ] **1.5 Phone normalize (TDD). `tests/test_importer.py`:**
```python
from campaigns.importer import normalize_phone
def test_valid_de(): assert normalize_phone("0151 23456789","DE") == "+4915123456789"
def test_already_e164(): assert normalize_phone("+4915123456789","DE") == "+4915123456789"
def test_invalid(): assert normalize_phone("not-a-number","DE") is None
```
- [ ] **1.6 Run → fail.** `docker compose run --rm web python -m pytest campaigns/tests/test_importer.py -q`.

- [ ] **1.7 `campaigns/importer.py`**
```python
import csv, phonenumbers
from openpyxl import load_workbook
COLUMNS = ["name", "phone", "context", "language"]

def normalize_phone(raw, region="DE"):
    try:
        p = phonenumbers.parse(str(raw).strip(), region)
        if not phonenumbers.is_valid_number(p): return None
        return phonenumbers.format_number(p, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        return None

def _rows(fileobj, filename):
    if filename.endswith(".csv"):
        return list(csv.DictReader((l.decode() if isinstance(l, bytes) else l for l in fileobj)))
    wb = load_workbook(fileobj); ws = wb.active
    header = [str(c.value).strip().lower() if c.value else "" for c in ws[1]]
    return [dict(zip(header, [c.value for c in row])) for row in ws.iter_rows(min_row=2)]

def parse_contacts(fileobj, filename, region="DE"):
    """Returns (valid:list[dict], invalid:list[dict])."""
    valid, invalid = [], []
    for r in _rows(fileobj, filename):
        name = (r.get("name") or "").strip()
        phone = normalize_phone(r.get("phone"), region)
        if not name or not phone:
            invalid.append({**r, "_error": "missing name or invalid phone"}); continue
        valid.append({"name": name, "phone": phone,
                      "context": (r.get("context") or "").strip(),
                      "language": (r.get("language") or "en").strip()})
    return valid, invalid
```
- [ ] **1.8 Run → pass.**

- [ ] **1.9 Outcome classify (TDD). `tests/test_outcomes.py`:**
```python
from campaigns.outcomes import classify_outcome
def test_failed(): assert classify_outcome("failed", []) == "failed"
def test_no_answer_empty(): assert classify_outcome("done", []) == "no_answer"
def test_answered(): assert classify_outcome("done", [{"role":"user","message":"hi"}]) == "answered"
```
- [ ] **1.10 `campaigns/outcomes.py`** (heuristic — refine later; ElevenLabs status doesn't expose busy/voicemail cleanly)
```python
def classify_outcome(status, transcript):
    if status == "failed":
        return "failed"
    if status in ("done", "processing"):
        return "answered" if transcript else "no_answer"
    return "failed"
```
> FLAG: busy/voicemail aren't distinguishable from ElevenLabs status alone. Inspect the conversation `metadata` (termination reason / call_duration_secs) on day 1 and refine. For the demo, no_answer/answered/failed is enough.

- [ ] **1.11 `campaigns/eleven.py`** (per-campaign `agent_id`)
```python
import os, httpx
BASE = "https://api.elevenlabs.io/v1"
def _h(): return {"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}

async def start_call(agent_id, to_number, dynamic_variables):
    body = {"agent_id": agent_id,
            "agent_phone_number_id": os.environ["ELEVEN_AGENT_PHONE_NUMBER_ID"],
            "to_number": to_number,
            "conversation_initiation_client_data": {"dynamic_variables": dynamic_variables}}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/convai/sip-trunk/outbound-call", json=body, headers=_h())
        r.raise_for_status(); return r.json()

async def get_conversation(cid):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/convai/conversations/{cid}", headers=_h())
        r.raise_for_status(); return r.json()

async def create_agent(name, system_prompt, first_message, voice_id, language, data_collection):
    body = {"name": name, "conversation_config": {
        "agent": {"first_message": first_message, "language": language,
                  "prompt": {"prompt": system_prompt, "llm": os.environ.get("ELEVEN_LLM","claude-haiku-4-5")}},
        "tts": {"voice_id": voice_id}}}
    # data_collection: dict of {key: {"type":..., "description":...}} → set under platform/analysis per API
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/convai/agents/create", json=body, headers=_h())
        r.raise_for_status(); return r.json()["agent_id"]
```
> Confirm the exact field path for Data Collection items in the create/update agent payload against the live API (Analysis/`platform_settings`); wire it in Slice 4.

- [ ] **1.12 MANUAL VERIFY** with a throwaway script/management command: load `examples/contacts_example.csv`, take row 1, `start_call(<your test agent_id>, contact.phone, {"name":..,"context":..})`, then poll `get_conversation` and print transcript until `done`. Your phone rings; transcript prints. (Use the existing `agent_4801…` agent for this smoke test.)
- [ ] **1.13 Commit.**

---

## Slice 2 — Temporal: ContactCallWorkflow (single contact, retry)

**DoD:** running `ContactCallWorkflow` for one contact places the call, and on a no-answer retries after the delay up to max attempts, all visible in Temporal UI (`:8233`).

**Files:** `backend/temporal_app/{__init__,worker,activities,workflows}.py`.

- [ ] **2.1 `temporal_app/activities.py`**
```python
import os, asyncio, json
from temporalio import activity
from redis.asyncio import Redis
from asgiref.sync import sync_to_async
from campaigns.eleven import start_call, get_conversation
from campaigns.outcomes import classify_outcome

@activity.defn
async def place_call_activity(contact_id: int, campaign_id: int) -> dict:
    # IMPORTANT: import models lazily; set up Django in worker bootstrap (see worker.py)
    from campaigns.models import Campaign, CampaignContact, CallAttempt
    contact = await sync_to_async(CampaignContact.objects.get)(id=contact_id)
    campaign = await sync_to_async(Campaign.objects.get)(id=campaign_id)
    redis = Redis.from_url(os.environ["REDIS_URL"])
    chan = f"campaign:{campaign_id}"
    dyn = {"name": contact.name, "context": contact.context or ""}
    res = await start_call(campaign.eleven_agent_id, contact.phone, dyn)
    cid = res["conversation_id"]
    seen, status, transcript = 0, "initiated", []
    while status not in ("done", "failed"):
        data = await get_conversation(cid)
        status = data.get("status"); transcript = data.get("transcript") or []
        for t in transcript[seen:]:
            await redis.publish(chan, json.dumps({"contact_id": contact_id, "type": "transcript",
                "role": "callee" if t.get("role")=="user" else "agent", "text": t.get("message")}))
        seen = len(transcript)
        await redis.publish(chan, json.dumps({"contact_id": contact_id, "type": "status", "status": status}))
        if status in ("done","failed"): break
        await asyncio.sleep(1)
    outcome = classify_outcome(status, transcript)
    result = (data.get("analysis") or {}).get("data_collection_results") or {}
    await redis.aclose()
    return {"conversation_id": cid, "outcome": outcome,
            "transcript": [{"role": t.get("role"), "text": t.get("message")} for t in transcript],
            "result": result}
```
> Add a max-duration guard (e.g. break after 120s) so voicemail can't loop forever.

- [ ] **2.2 `temporal_app/workflows.py`**
```python
from datetime import timedelta
from temporalio import workflow
with workflow.unsafe.imports_passed_through():
    from temporal_app.activities import place_call_activity

@workflow.defn
class ContactCallWorkflow:
    @workflow.run
    async def run(self, contact_id: int, campaign_id: int, retry_on: list,
                  retry_delay_minutes: int, max_attempts: int) -> dict:
        attempt = 0
        while True:
            attempt += 1
            res = await workflow.execute_activity(
                place_call_activity, args=[contact_id, campaign_id],
                start_to_close_timeout=timedelta(minutes=5),
            )
            if res["outcome"] in retry_on and attempt < max_attempts:
                await workflow.sleep(timedelta(minutes=retry_delay_minutes))  # durable timer
                continue
            res["attempts"] = attempt
            return res
```

- [ ] **2.3 `temporal_app/worker.py`** (Django-bootstrapped)
```python
import os, django, asyncio
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from temporalio.client import Client
from temporalio.worker import Worker
from temporal_app.activities import place_call_activity
from temporal_app.workflows import ContactCallWorkflow  # + CampaignWorkflow in Slice 3

async def main():
    client = await Client.connect(os.environ["TEMPORAL_HOST"], namespace=os.environ["TEMPORAL_NAMESPACE"])
    worker = Worker(client, task_queue="campaigns",
                    workflows=[ContactCallWorkflow],
                    activities=[place_call_activity])
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
```
- [ ] **2.4 MANUAL VERIFY** — a small script connects a Temporal client and starts `ContactCallWorkflow` for one contact; watch it in the Temporal UI (`localhost:8233`): the call places; if you don't answer, it sleeps `retry_delay_minutes` then retries (set delay=1 min for testing). Commit.

---

## Slice 3 — CampaignWorkflow (concurrency) + live monitor

**DoD:** launching a campaign calls N contacts respecting the concurrency cap; a bare page shows all calls streaming live.

**Files:** modify `workflows.py`, `worker.py`; add `campaigns/consumers.py`, `campaigns/routing.py`, `backend/static/monitor.html`.

- [ ] **3.1 `CampaignWorkflow`** (concurrency via a simple in-flight set)
```python
@workflow.defn
class CampaignWorkflow:
    @workflow.run
    async def run(self, campaign_id: int, contact_ids: list, concurrency: int,
                  retry_on: list, retry_delay_minutes: int, max_attempts: int):
        sem = workflow.Semaphore(concurrency) if hasattr(workflow, "Semaphore") else None
        async def one(cid):
            if sem: await sem.acquire()
            try:
                await workflow.execute_child_workflow(
                    ContactCallWorkflow.run, args=[cid, campaign_id, retry_on, retry_delay_minutes, max_attempts],
                    id=f"contact-{campaign_id}-{cid}")
            finally:
                if sem: sem.release()
        import asyncio
        await asyncio.gather(*[one(cid) for cid in contact_ids])
```
> If `workflow.Semaphore` isn't in your SDK version, gate concurrency by chunking `contact_ids` into batches of `concurrency` and `gather` per batch. Register `CampaignWorkflow` in the worker.

- [ ] **3.2 `campaigns/consumers.py`** — `CampaignMonitorConsumer`: on connect read `?token=` (mock; `close(4401)` if empty), subscribe Redis `campaign:{id}` (raw redis), forward each message to the browser. (Same shape as the activity publishes.)
- [ ] **3.3 `campaigns/routing.py`** — `re_path(r"ws/campaign/(?P<campaign_id>\d+)/$", CampaignMonitorConsumer.as_asgi())`.
- [ ] **3.4 `backend/static/monitor.html`** — vanilla page: input a campaign id → open `ws://localhost:8000/ws/campaign/{id}/?token=mock` → render one block per `contact_id` with status + transcript lines. (Throwaway; replaced by React.)
- [ ] **3.5 MANUAL VERIFY** — start `CampaignWorkflow` for both example contacts with concurrency=2; both phones ring; the page streams both transcripts. Commit.

---

## Slice 4 — AI generate + campaign API (wizard backend)

**Files:** `campaigns/generator.py`, `campaigns/api.py` (DRF), modify `urls.py`. Tests: `tests/test_generator.py`.

- [ ] **4.1 Generator (TDD the JSON shape with a stubbed client).** `campaigns/generator.py`
```python
import os, json
SYSTEM = ("You design an outbound phone-call script. Given a campaign GOAL, REASON, and the "
  "available customer fields, return STRICT JSON: {\"system_prompt\":..., \"first_message\":..., "
  "\"extraction_schema\":[{\"key\":...,\"type\":\"string|boolean|integer|number\",\"desc\":...}]}. "
  "The agent is an AI assistant calling on behalf of the company; reference fields as {name},{context}; "
  "keep calls under 90s; be polite and identify as AI.")

def generate_script(goal, reason, fields=("name","context")):
    provider = os.environ.get("ORCHESTRATOR_PROVIDER", "anthropic")
    user = f"GOAL: {goal}\nREASON: {reason}\nFIELDS: {', '.join(fields)}"
    if provider == "openai":
        from openai import OpenAI
        txt = OpenAI().chat.completions.create(model="gpt-4o-mini",
            messages=[{"role":"system","content":SYSTEM},{"role":"user","content":user}],
            response_format={"type":"json_object"}).choices[0].message.content
    else:
        import anthropic
        txt = anthropic.Anthropic().messages.create(model="claude-haiku-4-5-20251001", max_tokens=1200,
            system=SYSTEM, messages=[{"role":"user","content":user}]).content[0].text
    return _parse(txt)

def _parse(txt):
    s = txt[txt.find("{"): txt.rfind("}")+1]
    return json.loads(s)
```
Test `_parse` with fenced/noisy JSON → returns dict with the 3 keys.

- [ ] **4.2 DRF API** (`campaigns/api.py`) — endpoints from `docs/00-DESIGN.md §10`: create campaign, `contacts/upload` (parse → preview valid/invalid), `contacts/confirm` (persist), `generate` (call generator, save script fields), `PATCH` (edit), `launch`, `pause/resume/cancel`, `GET` detail+aggregates, `contacts` list, `export`.
- [ ] **4.3 `launch`** view: create the ElevenLabs agent (prompt+first_message+voice+data-collection from `extraction_schema`), store `eleven_agent_id`, connect a Temporal client and `start_workflow(CampaignWorkflow.run, ...)` with id `campaign-{id}`. Set `Campaign.status=running`.
- [ ] **4.4 MANUAL VERIFY** — via curl/HTTPie: create → upload csv → generate → launch → calls fire. Commit.

---

## Slice 5 — Structured outcomes + CSV export

- [ ] **5.1** Activity already returns `result` (from `analysis.data_collection_results`). On `ContactCallWorkflow` return, persist `CallAttempt` + set `CampaignContact.result/status/last_outcome` (an activity `finalize_contact_activity`, or do it in the launch-side via workflow query). Publish a `{"type":"result","contact_id",...}` frame.
- [ ] **5.2 CSV export (TDD sanitize).** `campaigns/export.py`: `sanitize(v)` strips leading `=+@-\t\r`; build CSV of name, phone, last_outcome, attempts, + extraction fields. `GET /export` returns it with a safe filename.
- [ ] **5.3 MANUAL VERIFY** — after a run, `/export` returns a CSV with outcomes + extracted fields. Commit.

---

## Slice 6 — React wizard + monitor (UX track)
Per cofounder's designs + `docs/00-DESIGN.md §6, §9`. Reuse the streaming pattern: `useCampaignStream(id)` opens `ws://localhost:8000/ws/campaign/${id}/?token=mock`, keyed by `contact_id`. Wizard = 6 steps hitting the Slice-4 API. Branding: black + orange, your logo. Connect WS straight to `:8000` (not via Vite proxy).

## Slice 7 — Stretch (below cut line)
pause/resume UI + signals, per-outcome retry rules, business-hours scheduling, voicemail/busy detection refinement, voice picker.

---

## Self-review flags
- **Temporal determinism:** all IO is in activities; workflows only orchestrate + `workflow.sleep`. Don't touch the DB or clock in workflow code.
- **Worker Django bootstrap:** `django.setup()` before importing models; activities use `sync_to_async` for ORM.
- **Concurrency** capped at `min(ElevenLabs plan=2 Free, Telnyx channels)`. Cap the wizard slider.
- **Outcome classification** is heuristic — refine with conversation `metadata` on day 1.
- **Data Collection field path** in the create-agent payload — verify against live API in Slice 4.
- **Results may need the post-call webhook** if `GET conversation` lacks `analysis` mid-poll — fallback documented in `docs/01-PITFALLS.md`.
