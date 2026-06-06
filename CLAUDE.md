# Rufen Campaign — Outbound AI Calling Campaigns (Hackathon Build)

**AI BEAVERS × Mollie Founder Hackathon · Hamburg · Sat June 6 2026.** 2-person team (backend = you, UX = cofounder, in parallel). Submit by 19:00, 3-min live pitch.

> **What it is:** upload an Excel of customers + context → a wizard builds a campaign (goal/reason → **AI-drafted call script** you edit → voice → concurrency + retry) → **Temporal** fires the calls with configurable concurrency, **retrying no-answers on a delay** → **live monitor** of every call → structured per-customer results + CSV export. Concrete wedge: an automotive recall team calling 50 owners individually to book service.

## ⚖️ Integrity rules (non-negotiable)
- **Build fresh today.** Real commit history from June 6 only. Do NOT import code from the private Rufen repo at `~/Projects/Rufen`. Reusing the *name* "Rufen" and *domain knowledge* is allowed; copying its code is not.
- Read `~/Projects/Rufen` for *patterns/reference only* (campaign models, realtime broadcaster, Temporal activity schema handling) — never copy files.

## Stack & locked decisions
- **Backend:** Django 5 + DRF + Channels + Daphne (ASGI). Postgres 16 + Redis 7.
- **Orchestration engine:** **Temporal** — durable campaign workflows: per-contact retry (delay + max attempts), concurrency, pause/resume.
- **Voice:** ElevenLabs Agents (managed STT→LLM→TTS). In-call LLM `claude-haiku-4-5`. Over a **Telnyx SIP trunk** (`+4934156154530`).
- **Orchestration LLM** (script + extraction-schema generation): **Claude or GPT** via existing keys — `ORCHESTRATOR_PROVIDER=anthropic|openai`. (No Qwen.)
- **Frontend:** React 19 + Vite + Tailwind 4 + shadcn (UX track). Black + orange. Backend exposes clean APIs + a bare monitor page so the demo works before final UI.
- **Auth + billing:** mocked.
- **Retry:** delay + max attempts; retry `no_answer|busy|failed`, stop on `answered|declined|wrong_number`.
- **Concurrency:** user-set per campaign, capped at `min(ElevenLabs plan, Telnyx channels)` = 2 Free / 5 Creator.
- **Excel:** FIXED schema `name, phone, context, language` (no mapping). Template: `examples/contacts_example.csv`.
- **Infra:** Docker Compose: `db · redis · temporal · temporal-ui · web · temporal-worker`.

## Repo structure (target)
```
backend/  config/ (settings, asgi, urls)
  campaigns/   models, eleven.py (ElevenLabs client), importer.py (Excel→contacts),
               generator.py (Claude/GPT → script+extraction), api.py, consumers.py,
               routing.py, export.py
  temporal/    worker.py, workflows.py (Campaign/ContactCall), activities.py (PlaceCall…)
  static/      monitor.html (bare live monitor; replaced by React)
frontend/      Vite + React (UX track)
examples/      contacts_example.csv (+ .xlsx)
docs/          design + plan
docker-compose.yml  .env (gitignored)  .env.example
```

## Commands
```bash
docker compose up --build            # db, redis, temporal(+ui), web(Daphne :8000), temporal-worker
docker compose exec web python manage.py migrate
docker compose exec web python manage.py makemigrations campaigns
# Temporal UI: http://localhost:8233   |   web/api: http://localhost:8000
ngrok http 8000                       # ONLY if you need the post-call webhook fallback (§ pitfalls)
```
Frontend (UX track): `cd frontend && npm run dev -- --host --port 3001`.

## Env (`.env`, gitignored — template `.env.example`)
Verified & reused: `ELEVENLABS_API_KEY` (✅ convai read+write), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER=+4934156154530`, `ELEVEN_LLM=claude-haiku-4-5`. New: `TEMPORAL_HOST=temporal:7233`, `TEMPORAL_NAMESPACE=rufen`, `ORCHESTRATOR_PROVIDER=anthropic`. Still to fill: **`ELEVEN_AGENT_PHONE_NUMBER_ID`** (after the Telnyx→ElevenLabs SIP import — the one pending manual step). `ELEVEN_AGENT_ID` is now created **per campaign** at launch.
> ElevenLabs plan = Free/PAYG → **2 concurrent** (fine; cap the slider at 2). Creator = 5.

## Architecture — the engine
```
Excel ─► importer ─► CampaignContact rows
Wizard ─► generator (Claude/GPT) ─► script_prompt + first_message + extraction_schema (user edits)
Launch ─► create ElevenLabs agent (prompt + Data-Collection items) ─► start Temporal CampaignWorkflow
  CampaignWorkflow  ── ≤N child workflows (concurrency) ──► ContactCallWorkflow(contact)
      ContactCallWorkflow: PlaceCallActivity → outcome; if retryable & attempts<max → sleep(delay) → retry
          PlaceCallActivity: POST sip-trunk/outbound-call (dynamic_variables = contact.context)
                             → poll GET conversations/{id} ~1s → publish turns to Redis (live monitor)
                             → on done: read analysis.data_collection_results → result
Browser ◄─ WS /ws/campaign/{id}/ ◄─ Redis pub/sub  (status, transcript turns, aggregates, retry countdowns)
```

## ElevenLabs — VERIFIED facts (build on these)
- **Place:** `POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call` (`xi-api-key`) `{agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data:{dynamic_variables}}` → `{conversation_id}` immediately.
- **Live transcript:** poll `GET /v1/convai/conversations/{id}` ~1/s; `transcript` (`[{role,message,time_in_call_secs}]`) fills while `status=in-progress`; statuses `initiated|in-progress|processing|done|failed`. (Monitor WS is Enterprise-only.)
- **Per-contact data:** pass `context` as `dynamic_variables`; script references `{name}`,`{context}`.
- **Structured results:** Data Collection items (string/boolean/integer/number) → `analysis.data_collection_results`. **Verify day 1** it's present in `GET conversation` after `done`; else register post-call webhook (`PUBLIC_URL`).
- **Agent per campaign:** `POST /v1/convai/agents/create` with `conversation_config.agent.prompt.llm="claude-haiku-4-5"`, `tts.voice_id`, the script prompt + data-collection items. Store `eleven_agent_id`.
- **Concurrency** per-workspace; one agent runs parallel calls.

## Telnyx SIP (one-time, dashboard) — the pending blocker
Separate SIP Connection for ElevenLabs (do NOT touch Rufen's Asterisk one). Transport **TLS/TCP (not UDP)**, codecs **G711 + G722**, Outbound Voice Profile, outbound → `sip.rtc.elevenlabs.io`, caller ID `+4934156154530`. Import that number into ElevenLabs → `ELEVEN_AGENT_PHONE_NUMBER_ID`.

## Build order & cut line
1. Models + Excel import + **PlaceCallActivity** (one real call → outcome + transcript).
2. `ContactCallWorkflow` (single contact, retry delay + max attempts).
3. `CampaignWorkflow` (N contacts, concurrency cap) + **bare live monitor page**.
4. AI generate (script + extraction) + wizard/campaign API.
5. Structured outcomes + CSV export.
6. React wizard + monitor dashboard (UX).
— **CUT LINE** (1–6 demoable) —
7. pause/resume, per-outcome retry rules, scheduling, voice-picker polish.

## Critical gotchas (full list `docs/01-PITFALLS.md`)
- **Temporal activities reuse threads → set DB/tenant context at the top of each activity.** (Rufen's #1 bug class.)
- **Workflows must be deterministic** — no clock/random/IO in workflow code; all IO in activities. Retry delay = `workflow.sleep()`, a durable timer (not `time.sleep`).
- Run **Daphne/ASGI**, not `runserver`, or WebSockets break.
- **WS straight to `:8000`** (never via Vite proxy). Reject anonymous WS (`close(4401)`).
- **Raw redis client** for the activity→consumer channel (Django cache adds a `:1:` prefix).
- **Cap call duration** + handle voicemail (burns minutes) — classify it as an outcome.
- **Write contact/attempt rows before originating** the call.
- **CSV export must sanitize** formula-injection prefixes (`=+@-`).
- Structured results arrive **post-call** — monitor shows "extracting…" then fills.
- Concurrency capped at `min(ElevenLabs, Telnyx)` — cap the slider; `log()` anything dropped.

## Parallel work split (start NOW, no UX needed)
Backend: models → PlaceCallActivity (test on your phone) → ContactCallWorkflow → CampaignWorkflow + bare monitor → Excel import → generator → API + CSV. UX-blocked: wizard + dashboard visuals only.

## Docs
- `docs/00-DESIGN.md` — full design (data model, wizard, Temporal workflows, API, ElevenLabs).
- `docs/01-PITFALLS.md` — gotchas. `docs/03-PREFLIGHT.md` — account/setup. `docs/plan/2026-06-06-rufen-campaign.md` — step-by-step plan.
- `docs/02-PITCH.md` (local, gitignored) — pitch/strategy.

## Demo safety
Run on a **hotspot**. Pre-record a perfect run. Use `examples/contacts_example.csv` with your + your teammate's real numbers as the 2 contacts. Cap concurrency at 2 (Free plan).
