# Rufen × Cara8 — Design Doc

> Outbound **calling-campaign** platform. Upload an Excel of customers + context → wizard builds a campaign → AI drafts the call script → fire calls with configurable concurrency → monitor live → retry no-answers on a delay → structured per-call outcomes + export.

**Hackathon:** AI BEAVERS × Mollie · Sat June 6 2026. **Build fresh** (reuse Rufen *patterns/knowledge* only — never import its code). Two-person team: backend (you) starts now; UX (cofounder) in parallel. This doc is written so **backend work starts immediately without waiting on designs.**

---

## 1. Concept & buyer
**Buyer:** an operations/recall coordinator at an automotive OEM or large dealer group who must call **many customers individually** for one specific reason — e.g. *"BMW needs 50 owners to bring their car in for a recall."* Today that's a person dialing down a spreadsheet, leaving voicemails, and hand-logging who they reached and what was said.

**Rufen × Cara8** turns that into: upload the list → describe the goal once → an AI call team works the whole list in parallel, retries the no-answers, and hands back a structured result per customer (reached? agreed to book? preferred date? callback?).

**Why it scores (pitch):** specific buyer, painful manual workflow with obvious ROI, AI used as the *labor* (not a chatbot), and a demo that visibly does in minutes what takes a person all day. (Full pitch in `docs/02-PITCH.md`.)

## 2. Locked decisions
- **Build fresh** (hackathon integrity). Reuse Rufen patterns by reference only.
- **Retry:** simple — fixed **delay + max attempts**; retry the outcomes `no_answer | busy | failed` (editable), stop on `answered | declined | wrong_number`.
- **Concurrency:** **user-configurable per campaign**, hard-capped at the account max (`min(ElevenLabs plan, Telnyx channels)` = 2 on Free / 5 on Creator).
- **Call script:** **AI generates** (Claude/GPT) the agent prompt + first message + extraction fields from the goal/reason + Excel columns; **user reviews/edits** in the wizard.
- **In-call LLM:** `claude-haiku-4-5` (ElevenLabs). **Orchestration LLM:** Claude or GPT via your existing keys (no Qwen).

## 3. Stack
- **Django 5 + DRF + Channels + Daphne** (ASGI), **Postgres 16**, **Redis 7**.
- **Temporal** — campaign orchestration (durable retries, delay timers, concurrency, pause/resume). This is the right tool for retry-with-delay across long spans.
- **ElevenLabs Agents** — the voice (STT→LLM→TTS+tools), in-call LLM `claude-haiku-4-5`, over a **Telnyx SIP trunk** (number `+4934156154530`).
- **Claude/GPT** — orchestration: script + extraction-schema generation (and optional post-call analysis).
- **React 19 + Vite + Tailwind 4 + shadcn** — wizard + monitor (UX track; backend exposes clean APIs + a bare monitor page so we can demo before final UI).
- **Docker Compose:** `db · redis · temporal · temporal-ui · web · temporal-worker`.

## 4. Data model
```python
Campaign(
  id, name, goal, reason,                        # goal/reason = free text from wizard
  status,            # draft | running | paused | completed | cancelled
  # script (AI-generated, user-editable)
  script_prompt, first_message, extraction_schema(JSON: [{key,type,desc}]),
  voice_id, language,
  # run settings
  concurrency(int), retry_delay_minutes(int), max_attempts(int),
  retry_on(JSON list, default ["no_answer","busy","failed"]),
  eleven_agent_id,   # one ElevenLabs agent per campaign (prompt + data-collection match)
  created_at, started_at, finished_at,
)
CampaignContact(
  id, campaign(FK), name, phone(E.164),
  context(text), language,   # from the fixed Excel schema → dynamic_variables {name, context}
  status,            # pending | calling | retry_wait | completed | failed | exhausted
  attempts(int), last_outcome, result(JSON),     # result = extracted fields
  created_at,
)
CallAttempt(
  id, contact(FK), attempt_no, conversation_id,
  outcome,           # answered | no_answer | busy | failed | voicemail | declined
  transcript(JSON),  # [{role, text, ts}]
  started_at, ended_at,
)
```
Status taxonomy kept deliberately small. `result` is written from the call's extracted fields.

## 5. Excel upload — FIXED standard schema (hardcoded, no mapping)
A fixed template keeps the build simple and the demo predictable. Standard columns (header row, case-insensitive):

| column | required | use |
|---|---|---|
| `name` | ✅ | customer name → `{name}` in the script |
| `phone` | ✅ | E.164 number (DE default region) → the number dialed |
| `context` | ◻ | free-text per-customer detail (vehicle, VIN, issue, recall code) → `{context}` |
| `language` | ◻ | `en`/`de` (default `en`) |

- Parse `.xlsx` with **openpyxl** (and `.csv`). Validate: reject rows missing `name`/`phone`; normalize `phone` → E.164 (flag invalid).
- Each valid row → `CampaignContact`. **dynamic_variables passed to the call = `{name, context}`** (+ `language`). The AI script references `{name}` and `{context}`.
- Ready template committed at **`examples/contacts_example.csv`** (and `.xlsx`) — 2 rows (you + teammate) for self-testing.

## 6. Campaign wizard (iterable — each step editable/re-runnable)
1. **Contacts** — upload Excel → map columns → preview valid/invalid rows.
2. **Goal & reason** — free text ("Get owners to book a recall service appointment"; "Airbag recall 23V-456"). Optional industry/skill template seed.
3. **Script (AI)** — generate → `script_prompt` + `first_message` + `extraction_schema`; user edits; **Regenerate** to iterate.
4. **Voice & language** — pick an ElevenLabs voice (`GET /v1/voices`, ▶ preview), language.
5. **Run settings** — concurrency slider (1..cap), retry delay (min), max attempts, which outcomes retry.
6. **Review & launch.**

## 7. AI generation (orchestration LLM)
`POST /api/campaigns/{id}/generate` → Claude/GPT with a system prompt: *"Given a campaign goal, reason, and the available customer fields {columns}, produce a JSON object: `system_prompt` (the agent's calling instructions, referencing fields as `{field}` placeholders, polite, < 90s, identifies itself as an AI assistant calling on behalf of <company>), `first_message`, and `extraction_schema` (the typed fields to capture from each call, e.g. agreed_to_book:boolean, preferred_date:string, callback_needed:boolean)."* Force JSON. User edits before launch. On launch, the `extraction_schema` is written as **ElevenLabs Data Collection items** on the campaign's agent.

## 8. Temporal workflows (the engine)
```
CampaignWorkflow(campaign_id)
  • load contacts; maintain an in-flight set sized to campaign.concurrency
  • for each contact → start ContactCallWorkflow as a child workflow
  • respect concurrency (only N children running at once)
  • handle signals: pause / resume / cancel
  • complete when all contacts terminal; mark Campaign.completed

ContactCallWorkflow(contact_id)
  attempt = 1
  loop:
    outcome = await PlaceCallActivity(contact, campaign)     # places + polls to terminal
    persist CallAttempt
    if outcome in campaign.retry_on and attempt < max_attempts:
        contact.status = retry_wait
        await workflow.sleep(retry_delay_minutes)            # durable timer
        attempt += 1; continue
    else:
        contact.status = completed/failed/exhausted; break
```
**Activities** (each sets tenant/db context at start — Rufen lesson):
- `PlaceCallActivity(contact, campaign)` → POST ElevenLabs `sip-trunk/outbound-call` with `dynamic_variables = contact.context`; **poll** `GET /v1/convai/conversations/{id}` ~1s, publishing transcript turns to Redis (live monitor) until terminal; classify `outcome` from final status (answered/no_answer/busy/failed/voicemail); after `done`, read `analysis.data_collection_results` → `result`. Returns `{outcome, transcript, result}`.
- `MarkContactActivity` / status updates via the ORM.

> **Concurrency** is enforced by `CampaignWorkflow` (≤ N children) **and** bounded by the account limit — cap the wizard slider at `min(ElevenLabs, Telnyx)`.
> **Verify on day 1:** that `GET /v1/convai/conversations/{id}` includes `analysis.data_collection_results` once `status=done`. If not, fall back to registering the post-call webhook (`PUBLIC_URL`) — see `docs/01-PITFALLS.md`.

## 9. Real-time monitoring
- **Channels consumer** `/ws/campaign/{id}/` → forwards, from Redis pub/sub: per-contact `status`, live `transcript` turns, `attempt` outcomes, and `aggregate` counters (pending/calling/completed/failed, success rate, retry-waiting + countdown).
- The `PlaceCallActivity` publishes turns/status to `campaign:{id}` (raw redis client — not Django cache). Reuse the slice-style poller→pubsub→consumer pattern.
- **Dashboard:** progress bar, live concurrency gauge, sortable contact table (expand a row → transcript + extracted fields), retry countdowns, and an **Export CSV** of results.

## 10. API
| Method · Path | Purpose |
|---|---|
| `POST /api/campaigns` | create draft |
| `POST /api/campaigns/{id}/contacts/upload` | Excel → preview + column mapping |
| `POST /api/campaigns/{id}/contacts/confirm` | persist mapped contacts |
| `POST /api/campaigns/{id}/generate` | AI → script + extraction schema |
| `PATCH /api/campaigns/{id}` | edit script / run settings |
| `POST /api/campaigns/{id}/launch` | create ElevenLabs agent + start `CampaignWorkflow` |
| `POST /api/campaigns/{id}/{pause\|resume\|cancel}` | Temporal signals |
| `GET /api/campaigns/{id}` | status + aggregates |
| `GET /api/campaigns/{id}/contacts` | contacts + outcomes |
| `GET /api/campaigns/{id}/export` | CSV of results (sanitize formula-injection) |
| `WS /ws/campaign/{id}/` | live monitor stream |

## 11. Parallel work split (start NOW vs wait on UX)
**Backend (you) — start immediately, zero UX needed:**
1. Models + migrations.
2. `PlaceCallActivity` (ElevenLabs place + poll + outcome + transcript + extraction) — testable against your own phone.
3. Temporal worker + `ContactCallWorkflow` (single contact, retry delay + max attempts).
4. `CampaignWorkflow` (N contacts, concurrency cap) + a **bare monitor page** (vanilla JS) so you can demo live without final UI.
5. Excel parse + import + phone normalization.
6. AI generate endpoint (Claude/GPT → JSON).
7. Channels monitor consumer + Redis plumbing + REST API + CSV export.

**UX-dependent (stub until designs land):** the wizard screens + the polished monitor dashboard. Backend exposes clean JSON APIs + the bare page, so nothing blocks on design.

## 12. Build order & cut line
1. Models + Excel import + **one real call** (PlaceCallActivity) storing outcome + transcript.
2. `ContactCallWorkflow` — single contact with retry (delay + max attempts).
3. `CampaignWorkflow` — N contacts, concurrency cap + **bare live monitor page**.
4. AI script/extraction generation + wizard API.
5. Structured outcomes + CSV export.
6. React wizard + monitor dashboard (UX).
— **CUT LINE** (1–6 demoable) —
7. pause/resume, per-outcome retry rules, scheduling/business-hours, voice-picker polish.

## 13. ElevenLabs — verified facts (build on these)
- **Place:** `POST /v1/convai/sip-trunk/outbound-call` `{agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data:{dynamic_variables}}` → `{conversation_id}` immediately.
- **Live transcript:** poll `GET /v1/convai/conversations/{id}` ~1s; `transcript` fills while `status=in-progress`; statuses `initiated|in-progress|processing|done|failed`.
- **Per-contact personalization:** pass the contact's `context` as `dynamic_variables`; the script references `{field}`.
- **Structured results:** Data Collection items (typed) → `analysis.data_collection_results` (post-call). Agent LLM `claude-haiku-4-5`.
- **One agent per campaign** (`POST /v1/convai/agents/create`) so prompt + data-collection match; store `eleven_agent_id`.
- **Concurrency** is per-workspace; one agent runs parallel calls.

## 14. .env additions (over the existing keys)
```
TEMPORAL_HOST=temporal:7233
TEMPORAL_NAMESPACE=rufen
ORCHESTRATOR_PROVIDER=anthropic   # or openai
# existing & verified: ELEVENLABS_API_KEY, ELEVEN_AGENT_PHONE_NUMBER_ID(*pending SIP import),
# TELNYX_API_KEY, TELNYX_FROM_NUMBER, ANTHROPIC_API_KEY, OPENAI_API_KEY
```
(`ELEVEN_AGENT_ID` is now created *per campaign* at launch, not a single global one.)

## 15. Decisions I made — please confirm
1. **Excel = FIXED schema** `name, phone, context, language` (no mapping; hardcoded). ✅ confirmed
2. **One ElevenLabs agent per campaign**, created at launch (vs one global agent + per-call overrides). ✔/✗?
3. **Read structured results from `GET conversation` analysis after `done`** (webhook only as fallback) — saves needing ngrok for the core flow. ✔/✗?
4. **Default `retry_on = [no_answer, busy, failed]`**, editable. ✔/✗?
5. **Run-now only** (no calendar scheduling) for v1; retry delays handle timing. ✔/✗?
6. **Orchestration LLM = Claude** (`claude-haiku-4-5-20251001`) by default, GPT switchable via `ORCHESTRATOR_PROVIDER`. ✔/✗?
