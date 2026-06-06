# Rufen AI — Agent-Native Parallel Calling (Hackathon Build)

**AI BEAVERS × Mollie Founder Hackathon · Hamburg · Sat June 6 2026.** Solo founder. Submit by 19:00, 3-min live pitch.

> **What it is:** a ChatGPT-style web app — describe a phone task → a 2-phase chat (Plan → Call) → AI places **parallel** outbound calls via ElevenLabs over a Telnyx SIP trunk → streams each transcript live → returns **structured, comparable results** (a table). The same capability is exposed over **MCP** so Claude Desktop can trigger calls.

## ⚖️ Integrity rules (non-negotiable)
- **Build fresh today.** Real commit history from June 6 only. Do NOT import code from the private Rufen repo at `~/Projects/Rufen`. Reusing the *name* "Rufen AI" and *domain knowledge* is allowed; copying its code is not.
- Read `~/Projects/Rufen` for *patterns/reference only* — never copy files.

## Stack & locked decisions
- **Voice:** ElevenLabs Agents (managed STT→LLM→TTS+tools). No Asterisk, no self-hosted voice.
- **Telephony:** Telnyx SIP trunk, ONE number (`+4934156154530`), 5 channels.
- **Backend:** Django 5 + Channels + Daphne (ASGI). Postgres 16 + Redis 7. **No Temporal, no Langfuse.** Parallel = asyncio tasks.
- **Agent LLM:** Claude Haiku — `claude-haiku-4-5` (verified id).
- **Planning LLM** (Phase-1 interview): Anthropic (`claude-haiku-4-5-20251001`) via `ANTHROPIC_API_KEY`.
- **Frontend:** React 19 + Vite + Tailwind 4 + shadcn. Black + orange (Rufen palette).
- **MCP:** FastMCP (stdio) + Claude Desktop.
- **Auth + billing:** mocked (clean screens, no Stripe, no real metering).
- **Infra:** Docker Compose (`db`, `redis`, `web`). MCP server + ngrok run on host.

## Repo structure (target)
```
backend/        Django: config/ (settings,asgi,urls) + calls/ app
  calls/        models, eleven.py (API client), poller.py, consumers.py,
                views.py, routing.py, tools.py, webhooks.py
  static/       index.html (slice-1 bare streaming page; replaced by React later)
frontend/       Vite + React (slice 5+)
mcp/            server.py (FastMCP)  — runs on HOST, not in compose
scripts/        create_agent.py (creates the ElevenLabs agent, prints id)
docs/           design + plan (see below)
docker-compose.yml  .env (gitignored)  .env.example
```

## Commands
```bash
docker compose up --build            # db + redis + web(Daphne :8000)
docker compose exec web python manage.py migrate
docker compose exec web python manage.py makemigrations
python scripts/create_agent.py       # one-time: creates ElevenLabs agent → prints ELEVEN_AGENT_ID
ngrok http 8000                       # host: public URL for server-tool + webhook (slices 4+)
# MCP (host venv): pip install "mcp[cli]" httpx ; python mcp/server.py
```
Frontend (slice 5+): `cd frontend && npm run dev -- --host --port 3001`.

## Env (`.env`, gitignored — template in `.env.example`)
Reused from Rufen + verified: `ELEVENLABS_API_KEY`*, `ANTHROPIC_API_KEY`, `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER=+4934156154530`, `ELEVEN_LLM=claude-haiku-4-5`. Still to fill: `ELEVEN_AGENT_ID`, `ELEVEN_AGENT_PHONE_NUMBER_ID`, `TEST_TO_NUMBER`. Later: `PUBLIC_URL` (ngrok), `RUFEN_SHARED_SECRET`.
> *⚠️ The current `ELEVENLABS_API_KEY` lacks Conversational-AI permissions (401 `missing convai_read`). It MUST be replaced with a key that has **Conversational AI read+write + Phone Numbers** scopes (or full-access) before any call works. ElevenLabs plan is Free/PAYG = **2 concurrent**; upgrade to Creator for 5.

## Architecture — the pipe
```
Browser ──HTTP /api/calls/run──► Django ──POST sip-trunk/outbound-call──► ElevenLabs ─SIP─► Telnyx ─► phone
   ▲  WS /ws/calls/{job}            │  asyncio poller: GET conversations/{id} ~1s
   └────────────────────────────────┘  → diff turns → Redis pub/sub → CallStreamConsumer → browser
Structured result ◄── post-call webhook /api/eleven/webhook (analysis.data_collection_results)
```

## ElevenLabs — VERIFIED facts (June 2026; build on these)
- **Place call:** `POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call`, header `xi-api-key`, body `{agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data?}` → returns `{conversation_id, sip_call_id}` immediately.
- **Live transcript (USE THIS):** poll `GET /v1/convai/conversations/{conversation_id}` ~1/s. `transcript` (list of `{role,message,time_in_call_secs}`) fills **while `status=in-progress`**. `status ∈ initiated|in-progress|processing|done|failed`. (The monitor WebSocket is Enterprise-only — don't use it.)
- **Agent LLM:** set `conversation_config.agent.prompt.llm = "claude-haiku-4-5"`.
- **Per-call customization:** prefer `conversation_initiation_client_data.dynamic_variables` (no setup). Full prompt/first_message override goes in `conversation_config_override` AND each such field must be enabled in the agent's **Security** tab or the call 422s.
- **Structured results (PRIMARY):** define typed **Data Collection** items (Analysis tab: string/boolean/integer/number) → delivered post-call via webhook at `data.analysis.data_collection_results`. Mid-call **server tool** (`/api/agent/tool`) is a flourish + the DB-read path, not the source of truth.
- **Concurrency:** per-workspace by plan; one agent runs parallel calls. No per-agent serialization.
- **Voices:** `GET /v1/voices`. Set `conversation_config.tts.voice_id`.
- **Agent CRUD:** `POST /v1/convai/agents/create`, `PATCH /v1/convai/agents/{id}`.

## Telnyx SIP (one-time, dashboard)
Separate SIP Connection for ElevenLabs (do NOT touch Rufen's Asterisk connection). Transport **TLS/TCP (not UDP)**, codecs **G711 + G722**, Outbound Voice Profile attached, outbound → `sip.rtc.elevenlabs.io`, caller ID = `+4934156154530`. Then import that number into ElevenLabs → `ELEVEN_AGENT_PHONE_NUMBER_ID`.

## Build order & cut line (protect the spine)
1. Skeleton + compose + ONE real call streaming to a bare page ← **slice 1, the spine**
2. Persist (models) + `/api/calls/run` single call
3. Parallel fan-out + multi-card streaming
4. Structured results (Data Collection + webhook) + comparison table
5. React chat UI (2-phase) + branding
6. Planning interview (`/api/calls/build`)
7. MCP server + Claude Desktop
— **CUT LINE** (1–7 must work) —
8. AI Config (persona/voice) · 9. Skills · 10. Settings (mock usage/billing)

## Critical gotchas (full list: `docs/01-PITFALLS.md`)
- Run **Daphne/ASGI**, not `runserver`, or WebSockets break.
- **Connect browser WS straight to `:8000`**, never through the Vite proxy (drops WS frames).
- **Cross-origin 3001→8000:** add `django-cors-headers` (+ credentials) OR mock-auth via a Bearer/token-in-query (no cookies/CSRF).
- **Write call rows / Redis keys BEFORE** originating the call (poller reads instantly).
- Use a **raw redis client** for the poller↔consumer channel (don't use Django cache — it adds a `:1:` prefix).
- **Cap call duration** + a janitor for stuck calls (voicemail burns minutes; lost hangups strand `in-progress`).
- **MCP stdio:** never `print()` to stdout (corrupts JSON-RPC) → log to stderr. Gate the call tool with a secret + destination allowlist.
- Reject anonymous WebSockets (`close(4401)`).
- Structured results arrive **post-call** (a few seconds after hangup) — UI shows "extracting…" then fills the row.

## Docs
- `docs/00-DESIGN.md` — full design (data model, API, WS contract, ElevenLabs integration, branding tokens).
- `docs/01-PITFALLS.md` — all gotchas.
- `docs/03-PREFLIGHT.md` — account/setup checklist.
- `docs/plan/2026-06-06-rufen-ai-build.md` — the step-by-step implementation plan (execute this).
- `docs/02-PITCH.md` (local, gitignored) — pitch/strategy (not in repo).

## Demo safety
Run on a **hotspot**, not venue wifi. Pre-record a perfect run as backup. Line up 3 reachable DE callees, tested. Keep ngrok up all day; `PUBLIC_URL` is the one place to re-point it.
