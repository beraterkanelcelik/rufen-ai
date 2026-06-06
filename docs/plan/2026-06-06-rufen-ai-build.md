# Rufen AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Read `CLAUDE.md` + `docs/00-DESIGN.md` first.** Integrity: build fresh, never copy from `~/Projects/Rufen`.

**Goal:** A web app + MCP server where a natural-language task triggers parallel ElevenLabs phone calls (Telnyx SIP) whose transcripts stream live into a chat UI and whose structured results return as a comparison table.

**Architecture:** Django + Channels (ASGI/Daphne) places calls via the ElevenLabs Agents API, polls each conversation ~1/s, publishes transcript turns through Redis pub/sub to a WebSocket consumer → browser. Structured fields come back via a post-call webhook. Parallel = asyncio tasks. React front-end + a stdio FastMCP server are thin clients on the same backend.

**Tech Stack:** Django 5, Channels, channels-redis, Daphne, httpx, Redis, Postgres, React 19 + Vite + Tailwind 4 + shadcn, FastMCP, Docker Compose.

**Note on testing:** the spine is real-I/O (live phone calls), so pure-logic units (transcript diffing, plan compose) get TDD unit tests; the call/stream paths use explicit **manual verification** steps. Commit after every task.

---

## Slice 0 — Prerequisites (manual, no code)

- [ ] **Fix the ElevenLabs API key.** Current key 401s on Conversational AI. In ElevenLabs → API Keys create a key with **Conversational AI (read+write) + Phone Numbers** scopes (or full access). Put it in `.env` as `ELEVENLABS_API_KEY`. Verify: `curl -s https://api.elevenlabs.io/v1/convai/agents -H "xi-api-key: $ELEVENLABS_API_KEY"` returns 200 (not 401).
- [ ] **(Recommended) Upgrade ElevenLabs to Creator** for 5 concurrent (Free = 2).
- [ ] **Telnyx SIP connection** for ElevenLabs (separate from Rufen's): TLS/TCP, G711+G722, Outbound Voice Profile, caller ID `+4934156154530`, outbound → `sip.rtc.elevenlabs.io`.
- [ ] **Import the number into ElevenLabs** (Agents → Phone Numbers → SIP trunk) → set `ELEVEN_AGENT_PHONE_NUMBER_ID` in `.env`.
- [ ] Set `TEST_TO_NUMBER` in `.env` to a phone you'll answer.
- [ ] `ELEVEN_AGENT_ID` is produced by Task 1.6 (`create_agent.py`).

---

## Slice 1 — The spine: one real call streaming to a bare page

**Definition of done:** `docker compose up` → open `http://localhost:8000/` → click **Call** → your phone rings → you talk → transcript lines appear live on the page.

**Files:**
- Create: `docker-compose.yml`, `backend/Dockerfile`, `backend/requirements.txt`, `backend/manage.py`
- Create: `backend/config/{__init__,settings,asgi,urls}.py`
- Create: `backend/calls/{__init__,apps,eleven,poller,consumers,views,routing}.py`
- Create: `backend/static/index.html`, `scripts/create_agent.py`
- Test: `backend/calls/tests/test_poller.py`

- [ ] **Step 1.1 — `backend/requirements.txt`**
```
Django==5.0.6
channels==4.1.0
channels-redis==4.2.0
daphne==4.1.2
httpx==0.27.0
redis==5.0.4
psycopg[binary]==3.1.19
django-cors-headers==4.3.1
```

- [ ] **Step 1.2 — `backend/Dockerfile`**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
```

- [ ] **Step 1.3 — `docker-compose.yml`** (repo root)
```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_DB: rufen, POSTGRES_USER: rufen, POSTGRES_PASSWORD: rufen }
    ports: ["127.0.0.1:5432:5432"]
  redis:
    image: redis:7
    ports: ["127.0.0.1:6379:6379"]
  web:
    build: ./backend
    command: daphne -b 0.0.0.0 -p 8000 config.asgi:application
    env_file: .env
    ports: ["8000:8000"]
    volumes: ["./backend:/app"]
    depends_on: [db, redis]
```

- [ ] **Step 1.4 — Django project files**

`backend/manage.py` (standard Django manage.py pointing to `config.settings`).

`backend/config/settings.py`:
```python
import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["*"]
INSTALLED_APPS = [
    "daphne", "channels", "corsheaders",
    "django.contrib.contenttypes", "django.contrib.auth", "django.contrib.staticfiles",
    "calls",
]
MIDDLEWARE = ["corsheaders.middleware.CorsMiddleware", "django.middleware.common.CommonMiddleware"]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True, "OPTIONS": {}}]
ASGI_APPLICATION = "config.asgi.application"
CHANNEL_LAYERS = {"default": {"BACKEND": "channels_redis.core.RedisChannelLayer",
    "CONFIG": {"hosts": [os.environ.get("REDIS_URL", "redis://redis:6379/0")]}}}
DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql",
    "NAME": "rufen", "USER": "rufen", "PASSWORD": "rufen", "HOST": "db", "PORT": "5432"}}
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
```

`backend/config/asgi.py`:
```python
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from django.core.asgi import get_asgi_application
django_asgi = get_asgi_application()
from channels.routing import ProtocolTypeRouter, URLRouter
from calls.routing import websocket_urlpatterns
application = ProtocolTypeRouter({
    "http": django_asgi,
    "websocket": URLRouter(websocket_urlpatterns),
})
```

`backend/config/urls.py`:
```python
from django.urls import path
from django.views.generic import TemplateView
from calls import views
urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html")),
    path("api/test-call", views.test_call),
]
```
(Add `backend/calls/apps.py` with a standard `CallsConfig(name="calls")` and `backend/calls/__init__.py` empty.)

- [ ] **Step 1.5 — ElevenLabs client `backend/calls/eleven.py`**
```python
import os, httpx
BASE = "https://api.elevenlabs.io/v1"
def _headers(): return {"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}

async def start_call(to_number, dynamic_variables=None):
    body = {
        "agent_id": os.environ["ELEVEN_AGENT_ID"],
        "agent_phone_number_id": os.environ["ELEVEN_AGENT_PHONE_NUMBER_ID"],
        "to_number": to_number,
    }
    if dynamic_variables:
        body["conversation_initiation_client_data"] = {"dynamic_variables": dynamic_variables}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/convai/sip-trunk/outbound-call", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()  # {success, conversation_id, sip_call_id}

async def get_conversation(conversation_id):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/convai/conversations/{conversation_id}", headers=_headers())
        r.raise_for_status()
        return r.json()  # {status, transcript:[{role,message,time_in_call_secs}], ...}
```

- [ ] **Step 1.6 — Agent creator `scripts/create_agent.py`** (run on HOST: `pip install httpx`, load `.env`, `python scripts/create_agent.py`)
```python
import os, httpx, json
KEY = os.environ["ELEVENLABS_API_KEY"]
body = {
  "name": "Rufen Caller",
  "conversation_config": {
    "agent": {
      "first_message": "Hi! I'm an assistant calling on behalf of a customer. Do you have a quick moment?",
      "language": "en",
      "prompt": {
        "prompt": "You are a polite assistant making a short phone call to a business to ask specific questions. Ask the questions clearly, confirm the answers, keep it under 90 seconds, then thank them and end.",
        "llm": os.environ.get("ELEVEN_LLM", "claude-haiku-4-5"),
      },
    },
    "tts": {"voice_id": "JBFqnCBsd6RMkjVDRZzb"},  # pick any from GET /v1/voices
  },
}
r = httpx.post("https://api.elevenlabs.io/v1/convai/agents/create", json=body,
               headers={"xi-api-key": KEY}, timeout=30)
r.raise_for_status()
print("ELEVEN_AGENT_ID=", r.json()["agent_id"])
```
Put the printed id into `.env` as `ELEVEN_AGENT_ID`.

- [ ] **Step 1.7 — Transcript diff (TDD). Test `backend/calls/tests/test_poller.py`:**
```python
from calls.poller import diff_new_turns
def test_diff_returns_all_when_none_seen():
    turns = [{"role":"agent","message":"hi"},{"role":"user","message":"yes"}]
    new, seen = diff_new_turns(turns, 0)
    assert [t["message"] for t in new] == ["hi","yes"] and seen == 2
def test_diff_returns_only_tail():
    turns = [{"role":"agent","message":"hi"},{"role":"user","message":"yes"}]
    new, seen = diff_new_turns(turns, 1)
    assert [t["message"] for t in new] == ["yes"] and seen == 2
```
- [ ] **Step 1.8 — Run it, see it fail:** `docker compose run --rm web python -m pytest calls/tests/test_poller.py -q` → FAIL (no `diff_new_turns`).

- [ ] **Step 1.9 — `backend/calls/poller.py`**
```python
import os, asyncio, json
from redis.asyncio import Redis
from .eleven import get_conversation

def diff_new_turns(turns, seen_count):
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
                    "task_id": conversation_id, "type": "transcript",
                    "role": ROLE_MAP.get(t.get("role"), t.get("role")),
                    "text": t.get("message")}))
            await redis.publish(channel, json.dumps({
                "task_id": conversation_id, "type": "status", "status": status}))
            if status in ("done", "failed"):
                break
            await asyncio.sleep(1)
    finally:
        await redis.aclose()
```
- [ ] **Step 1.10 — Tests pass:** rerun pytest → PASS.

- [ ] **Step 1.11 — WebSocket consumer `backend/calls/consumers.py`**
```python
import os, asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from redis.asyncio import Redis

class CallStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.job = self.scope["url_route"]["kwargs"]["job_id"]
        await self.accept()  # slice 1: open. Slice 5 adds token check → close(4401) if missing.
        self.redis = Redis.from_url(os.environ["REDIS_URL"])
        self.pubsub = self.redis.pubsub()
        await self.pubsub.subscribe(f"call:{self.job}")
        self.task = asyncio.create_task(self._listen())

    async def _listen(self):
        async for msg in self.pubsub.listen():
            if msg.get("type") == "message":
                data = msg["data"]
                await self.send(text_data=data.decode() if isinstance(data, bytes) else data)

    async def disconnect(self, code):
        if hasattr(self, "task"): self.task.cancel()
        try:
            await self.pubsub.unsubscribe(); await self.redis.aclose()
        except Exception: pass
```

- [ ] **Step 1.12 — `backend/calls/routing.py`**
```python
from django.urls import re_path
from .consumers import CallStreamConsumer
websocket_urlpatterns = [re_path(r"ws/call/(?P<job_id>[^/]+)/$", CallStreamConsumer.as_asgi())]
```

- [ ] **Step 1.13 — `backend/calls/views.py`**
```python
import os, asyncio
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .eleven import start_call
from .poller import poll_conversation

@csrf_exempt
async def test_call(request):
    res = await start_call(os.environ["TEST_TO_NUMBER"])
    cid = res["conversation_id"]
    asyncio.create_task(poll_conversation(cid, f"call:{cid}"))
    return JsonResponse({"conversation_id": cid})
```

- [ ] **Step 1.14 — `backend/static/index.html`** (vanilla; throwaway, replaced in slice 5)
```html
<!doctype html><meta charset="utf-8"><title>Rufen AI</title>
<body style="background:#0a0a0a;color:#e0e0e0;font-family:system-ui;padding:2rem">
<h1 style="color:#f97316">Rufen AI — call test</h1>
<button id="call" style="background:#f97316;color:#fff;border:0;padding:.7rem 1.2rem;border-radius:999px;font-size:1rem">Call</button>
<ul id="log" style="margin-top:1.5rem;line-height:1.6"></ul>
<script>
const log = (t) => { const li=document.createElement('li'); li.textContent=t; document.getElementById('log').appendChild(li); };
document.getElementById('call').onclick = async () => {
  log('placing call…');
  const r = await fetch('/api/test-call', {method:'POST'});
  const {conversation_id} = await r.json();
  log('conversation '+conversation_id);
  const ws = new WebSocket(`ws://${location.host}/ws/call/${conversation_id}/`);
  ws.onmessage = (e) => { const m=JSON.parse(e.data);
    if (m.type==='transcript') log(`${m.role}: ${m.text}`);
    else if (m.type==='status') log(`[${m.status}]`); };
};
</script></body>
```

- [ ] **Step 1.15 — MANUAL VERIFY:** ensure `.env` has the fixed key + `ELEVEN_AGENT_ID` + `ELEVEN_AGENT_PHONE_NUMBER_ID` + `TEST_TO_NUMBER`. `docker compose up --build`. Open `http://localhost:8000/`, click **Call**. Expected: your phone rings; speak; transcript lines + `[in-progress]`…`[done]` appear live.
- [ ] **Step 1.16 — Commit:** `git add -A && git commit -m "feat: slice 1 — live streaming call pipe (ElevenLabs→Telnyx→poll→WS→page)"`

---

## Slice 2 — Persist calls + `/api/calls/run` (single call)

**Goal:** real models, a job/task record, and the canonical run endpoint (1 call) the rest builds on.

**Files:** Create `backend/calls/models.py`; modify `views.py`, `urls.py`, `settings.py` (add `"django.contrib.admin"`? no — keep minimal), add migration.

- [ ] **Step 2.1 — `models.py`** (per `docs/00-DESIGN.md §5`, trimmed for slice 2)
```python
from django.db import models
class CallJob(models.Model):
    instruction = models.TextField(default="")
    status = models.CharField(max_length=20, default="running")
    created_at = models.DateTimeField(auto_now_add=True)
class CallTask(models.Model):
    job = models.ForeignKey(CallJob, related_name="tasks", on_delete=models.CASCADE)
    to_number = models.CharField(max_length=32)
    business_name = models.CharField(max_length=120, blank=True)
    conversation_id = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, default="queued")
    transcript = models.JSONField(default=list)
    result = models.JSONField(null=True, blank=True)
    error = models.TextField(blank=True)
```
- [ ] **Step 2.2 — Migrate:** `docker compose exec web python manage.py makemigrations calls && docker compose exec web python manage.py migrate`.
- [ ] **Step 2.3 — `/api/calls/run`** (replaces test-call): accept `{instruction?, targets:[{number,business_name}]}`, create `CallJob` + `CallTask` rows **before** originating (pitfall: rows first), set `conversation_id`, start a poller per task that also persists turns/status onto the row. Return `{job_id, tasks:[{id,to_number,business_name}]}`.
  - Extend `poll_conversation` to take `task_id`, and on each loop append new turns to `CallTask.transcript` and update `status` (use `sync_to_async` / `Model.objects.aupdate`). Publish on channel `call:{job_id}` with `task_id`.
- [ ] **Step 2.4 — MANUAL VERIFY:** POST `/api/calls/run` with one target → phone rings, row persists, page (pointed at `ws/call/{job_id}/`) streams. 
- [ ] **Step 2.5 — Commit.**

---

## Slice 3 — Parallel fan-out

**Goal:** one instruction → N concurrent calls, each streaming under its own `task_id`.

- [ ] **Step 3.1** — `/api/calls/run` loops over `targets`, creating a `CallTask` + an `asyncio.create_task(poll_conversation(...))` per target, all publishing to the same `call:{job_id}` channel keyed by `task_id`.
- [ ] **Step 3.2** — Guard concurrency: if `len(targets)` exceeds the ElevenLabs limit you'll get errors on the surplus — cap at 5 and `log()` any dropped (pitfall: no silent caps).
- [ ] **Step 3.3 — MANUAL VERIFY:** run with 2–3 targets (your test phones) → all ring, transcripts stream in parallel, distinguishable by `task_id`.
- [ ] **Step 3.4 — Commit.**

---

## Slice 4 — Structured results (Data Collection + webhook) + comparison

**Goal:** typed fields per call → comparison table. Requires `PUBLIC_URL` (ngrok) for the webhook.

**Files:** `backend/calls/webhooks.py`, `backend/calls/tools.py` (optional flourish), modify `urls.py`, `scripts/create_agent.py` (add data-collection items + server tool), `.env` (`PUBLIC_URL`, `RUFEN_SHARED_SECRET`).

- [ ] **Step 4.1 — Define Data Collection items** on the agent (Analysis tab or via agent update API): the typed fields you want (e.g. `price` number, `available` boolean). For the demo these can be fixed; later they come from the skill's `extraction_schema`.
- [ ] **Step 4.2 — Register post-call webhook** to `${PUBLIC_URL}/api/eleven/webhook` (ElevenLabs dashboard or API).
- [ ] **Step 4.3 — `webhooks.py`**: verify the HMAC signature, read `data.analysis.data_collection_results`, map to `{key: value}`, write `CallTask.result` (match by `conversation_id`), and publish a `{"type":"result","task_id":...,"result":{...}}` frame on `call:{job_id}`.
- [ ] **Step 4.4 — (Optional flourish) `tools.py` `/api/agent/tool`**: shared-secret header; supports `lookup_business` (read) + `save_result` (provisional write). Validate args. Gives the "agent uses a DB live" beat.
- [ ] **Step 4.5 — MANUAL VERIFY:** with ngrok up, run a call; after hangup the `result` frame arrives (~seconds later) and the row's `result` fills. Build the page to render a comparison row per task.
- [ ] **Step 4.6 — Commit.**

---

## Slice 5 — React chat UI (2-phase) + branding

**Goal:** replace the bare page with the ChatGPT-style UI. See `docs/00-DESIGN.md §9` (2-phase Plan→Call) and `§12-13` (pages + palette). The executor may generate components from that spec; the load-bearing piece is the streaming hook.

**Files:** `frontend/` (Vite React TS + Tailwind 4 + shadcn), add `frontend` service to compose (or run on host). Palette tokens from `docs/00-DESIGN.md §13`.

- [ ] **Step 5.1 — Scaffold** `npm create vite@latest frontend -- --template react-ts`; add Tailwind 4 + shadcn; paste palette tokens (orange `#F97316`, near-black surfaces); add your logo to `frontend/public/`.
- [ ] **Step 5.2 — Streaming hook `useCallStream(jobId)`**: opens `ws://localhost:8000/ws/call/${jobId}/?token=mock`, keeps a `Map<task_id, {status, turns[], result}>`, appends `transcript` frames, updates `status`, sets `result`. (Connect straight to :8000 — never through Vite proxy.)
- [ ] **Step 5.3 — Chat layout**: sidebar (New Call + history) + center chat. Phase-1 renders interview Q&A bubbles + an editable plan card; Phase-2 renders one streaming card per task + a comparison table when >1.
- [ ] **Step 5.4 — Mock auth**: a login screen that accepts any email, stores a mock token; backend WS consumer now reads `?token=` and `close(4401)` if empty (update `consumers.py`).
- [ ] **Step 5.5 — MANUAL VERIFY:** full flow looks clean, calls stream into cards, table fills. **Run Playwright/manual at 390×844 too** (mobile).
- [ ] **Step 5.6 — Commit.**

---

## Slice 6 — Planning interview (`/api/calls/build`)

**Goal:** Phase-1 agentic loop that asks clarifying questions then compiles the plan. Uses `ANTHROPIC_API_KEY` + `claude-haiku-4-5-20251001`.

**Files:** `backend/calls/planner.py`, modify `views.py`/`urls.py`.

- [ ] **Step 6.1 — `planner.py`**: a function `build(instruction, answers) -> {"phase":"plan","need":[...]} | {"phase":"ready","plan":{...}}`. Call Anthropic messages API with the system prompt from `docs/00-DESIGN.md §9`; force JSON output. TDD the JSON-shape parsing with a stubbed LLM response.
- [ ] **Step 6.2 — `/api/calls/build`** wires it; frontend loops build→answer until `ready`, shows the editable plan card, then calls `/api/calls/run` with the plan's `targets`.
- [ ] **Step 6.3 — MANUAL VERIFY:** vague instruction → gets 1–3 questions → produces an editable plan → runs.
- [ ] **Step 6.4 — Commit.**

---

## Slice 7 — MCP server (Claude triggers a call)

**Goal:** Claude Desktop → MCP → `/api/calls/run` → real call. See `docs/00-DESIGN.md §10`.

**Files:** `mcp/server.py`, `mcp/requirements.txt`. Runs on HOST (not compose).

- [ ] **Step 7.1 — `mcp/server.py`** (FastMCP stdio): tools `start_calls(instruction, numbers[])` → POST `/api/calls/run` (header `X-Rufen-Secret`); `get_results(job_id)` → GET `/api/calls/{job_id}`. **Never `print()` to stdout.** Gate with secret + a destination allowlist.
- [ ] **Step 7.2 — Backend**: add `GET /api/calls/{job_id}` (job + tasks + results) and require `X-Rufen-Secret` on `/api/calls/run` when present. Since Claude is the planner, `start_calls` skips Phase-1 (silent compose).
- [ ] **Step 7.3 — Wire Claude Desktop** (`claude_desktop_config.json` → `rufen` server, absolute python path). Restart Claude Desktop.
- [ ] **Step 7.4 — MANUAL VERIFY:** ask Claude "call +49… and ask their opening hours" → real call places, `get_results` returns the structured result.
- [ ] **Step 7.5 — Commit.**

---

## Slices 8–10 — Stretch (below the cut line; do only if 1–7 solid)

- [ ] **Slice 8 — AI Config page:** persona prompt + voice picker (`GET /v1/voices`, ▶ preview) + language; persist an `AgentConfig` row; `PATCH` the ElevenLabs agent. Commit.
- [ ] **Slice 9 — Skills:** `Skill` model (key, prompt_template, extraction_schema, tool_keys); a picker in Phase-1 that seeds the plan. Commit.
- [ ] **Slice 10 — Settings (mock):** MCP-setup tab (show the config snippet + secret), Usage + Billing tabs with static numbers. Commit.

---

## Self-review notes (gaps the executor must mind)
- **ElevenLabs key scope** is the #1 blocker — Slice 0 Task gates everything.
- **Async DB writes** in the poller need `sync_to_async`/`a*` ORM methods (pitfall: don't block the event loop).
- **Data Collection result timing** is post-hangup — the table fills a few seconds after `completed`; show an "extracting…" state.
- **Concurrency** caps at min(Telnyx 5, ElevenLabs plan): on Free that's 2 — rehearse the demo at your real limit.
- **ngrok URL** changes on restart → keep it in `.env` `PUBLIC_URL` only.
