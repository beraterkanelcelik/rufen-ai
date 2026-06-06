# 00 — Design & Build Doc

> Read top-to-bottom once, then jump to **§11 Build Order** and work the clock.

---

## 1. What we're building (and explicitly NOT)

**Rufen AI** is a ChatGPT-style web app where you describe a phone task in natural language. Rufen AI:

1. **Interviews you** (short multi-turn) to fill the gaps a good call needs — budget, dates, "ask only" vs "book it", which businesses.
2. **Composes the call** — turns your answers into an optimized agent prompt + an explicit **extraction schema** (the exact fields to capture).
3. **Fires the call(s) in parallel** via ElevenLabs over a Telnyx number.
4. **Streams each call live** into the chat (turn-by-turn transcript), and at the end shows a **structured, comparable result** (table when >1 call).
5. **Exposes the same capability over MCP** so Claude Desktop can trigger a call itself.

The agent can **read** a small business-knowledge table and **write** structured results back **mid-call** (the differentiating "tool + mini-DB" feature).

### The three things that make this not "just another Vapi"
- **Call-builder interview** → better prompts → higher call success (attacks the #1 failure mode of every competitor).
- **Parallel fan-out → typed, comparable results** (a table, not a transcript dump).
- **Skills** — reusable templates (Get a quote / Book / Check availability / Negotiate) that bundle prompt + extraction schema + tools.

### NOT building (cut for time / handled by ElevenLabs)
Asterisk, any self-hosted voice/STT/LLM/TTS, Temporal, Langfuse, django-tenants multi-tenancy, RBAC, real billing/Stripe, real auth (magic-link/OAuth), agent versioning, knowledge-base/CAG, campaigns, inbox, analytics. (Full rationale: Rufen's `apps/ai` + `worker/` complexity all collapses because ElevenLabs owns the media path.)

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────┐
│  React SPA (Vite :3001)  — ChatGPT-style UI                │
│   • New Call (chat + interview)   • AI Config (persona/voice)│
│   • Skills   • Settings (MCP / Usage / Billing — mocked)    │
└───────▲───────────────────────────────────────────▲────────┘
        │ HTTP /api/*                                │ WS /ws/calls/{job}
        │                                            │ (turn-by-turn stream)
┌───────┴────────────────────────────────────────────┴────────┐
│  Django + Channels (Daphne :8000)                            │
│   • /api/calls/build      (interview LLM: clarify + compose) │
│   • /api/calls/run        (create job → spawn N call tasks)  │
│   • /api/eleven/webhook   (post-call: final transcript+data) │
│   • /api/agent/tool       (ElevenLabs SERVER TOOL: read/write DB)│
│   • CallStreamConsumer    (Redis pub/sub → browser)          │
│   • asyncio poller per call (ElevenLabs conversation → Redis)│
└───────▲───────────────────────────────────────────▲─────────┘
        │ REST (xi-api-key)                          │ Postgres + Redis
        │                                            │
┌───────┴───────────────┐                  ┌─────────┴──────────┐
│  ElevenLabs Agents     │  SIP (TLS/TCP)   │  Telnyx SIP trunk  │ → PSTN
│  STT→LLM→TTS+tools     │ ───────────────► │  (one number)      │
└────────────────────────┘                  └────────────────────┘

         ┌──────────────────────────────┐
         │  MCP server (FastMCP, stdio) │  ← Claude Desktop
         │  tool: start_calls(...)      │ ──HTTP──► /api/calls/run
         │  tool: get_results(job_id)   │
         └──────────────────────────────┘
```

**Public URL:** ElevenLabs server-tools + post-call webhook need to reach your laptop → run **ngrok/cloudflared** to `:8000`. (MCP via Claude Desktop is local stdio and does NOT need the tunnel; only the backend webhooks do.)

---

## 3. Stack & what each piece replaces in Rufen

| Concern | Hackathon choice | Rufen equivalent (skipped) |
|---|---|---|
| Voice pipeline | **ElevenLabs Agents** | `worker/` (Qwen STT/LLM/TTS, VAD, dispatcher) |
| Telephony | **Telnyx SIP trunk** (1 number) | `apps/asterisk/` (ARI, dialplan) |
| Outbound originate | `POST /v1/convai/sip-trunk/outbound-call` | `apps/playground/call_api.py` (ARI originate) |
| Live transcript | **Poll ElevenLabs conversation → Redis → WS** | `consumers_monitor.py` + worker pub/sub |
| Async / parallel | **asyncio tasks** (Channels) | Temporal workflows |
| Tools / DB | **ElevenLabs server tools → Django** | `apps/agents` tool_executor |
| Persona/voice | **1 Postgres row + ElevenLabs agent config** | `AIAgent.structured_prompt` + versioning |
| Auth/billing | **Mocked** | passwordless + prepaid balance |
| Frontend | **React/Vite/Tailwind/shadcn (fresh)** | same stack, reused knowledge only |

> **Reuse knowledge, not bytes.** Copy *patterns* from Rufen (event taxonomy, the create-record-then-stream flow) but **type the code fresh today** — see integrity note in `02-PITCH.md`.

---

## 4. Core product flow (the happy path)

```
User types: "Call 3 barbers near me and ask price for men's cut + beard,
             and whether they're free this afternoon."
   │
   ▼  POST /api/calls/build  (LLM, multi-turn)
Rufen AI asks: "What's your budget ceiling? Any preferred time window?
             Should I just ask, or try to book?"
   │  (user answers; or skips)
   ▼  POST /api/calls/build  → returns a COMPILED call plan:
   {
     skill: "get_quote",
     system_prompt: "...optimized...",
     first_message: "Hi, I'm calling on behalf of...",
     extraction_schema: [
        {key:"price_cut",   type:"number", desc:"price for men's haircut"},
        {key:"price_beard", type:"number", desc:"price for beard trim"},
        {key:"avail_pm",    type:"bool",   desc:"free this afternoon"}
     ],
     targets: [{name:"Barber A", number:"+49..."}, ...]
   }
   │  (user reviews/edits, clicks Run)
   ▼  POST /api/calls/run   → CallJob + N CallTask, returns {job_id, tasks:[{id,number}]}
   │  Browser opens WS /ws/calls/{job_id}
   ▼  Backend spawns N asyncio tasks → ElevenLabs outbound-call each
        → per-call poller streams turns → Redis → WS → chat cards
        → agent calls server tool save_result(...) mid/end call → DB
   ▼  All done → chat shows a COMPARISON TABLE:
        Barber A | €25 | €12 | yes
        Barber B | €30 | —   | no
        Barber C | €22 | €10 | yes
```

---

## 5. Data model (Postgres — keep it tiny)

```python
# users — MOCK auth, but a real table so usage/billing screens look real
User(id, email, name, created_at)

# persona / voice config (one "live" row is fine; allow a few)
AgentConfig(
    id, user_id, name,
    persona_prompt,            # base identity/tone, prepended to every call
    voice_id,                  # ElevenLabs voice
    language,                  # "en"/"de"/...
    eleven_agent_id,           # the persistent ElevenLabs agent this maps to
    is_default
)

# skills — reusable call templates
Skill(
    id, user_id, key, name, icon,
    prompt_template,           # with {placeholders}
    extraction_schema,         # JSON: [{key,type,desc}]
    tool_keys,                 # ["save_result","lookup_business"]
)

# a run = one user instruction → many calls
CallJob(id, user_id, instruction, skill_id, status, created_at)

CallTask(
    id, job_id,
    to_number, business_name,
    eleven_conversation_id,    # set after originate
    status,                    # queued|calling|ringing|in_progress|completed|failed
    transcript,                # JSON list [{role, text, ts}]
    result,                    # JSON: extracted fields {price_cut:25, ...}
    error, started_at, ended_at
)

# the agent's READ table (business knowledge it can look up mid-call)
BusinessKnowledge(id, user_id, name, value)   # e.g. ("our_company","Acme GmbH")

# the agent's WRITE target is CallTask.result (via save_result tool)
```

`status` taxonomy (copied down from Rufen's 11 → **5**): `queued · calling · ringing · in_progress · completed · failed`. Add a **janitor**: any task stuck >5 min → `failed` (see pitfalls).

---

## 6. API endpoints

### Browser ↔ Django (REST, `/api/`)
| Method · Path | Body | Returns |
|---|---|---|
| `POST /api/auth/login` | `{email}` | `{user}` (mock — accept anything, set session) |
| `POST /api/calls/build` | `{instruction, answers?, skill_id?}` | either `{need:[questions]}` **or** `{plan:{...compiled...}}` |
| `POST /api/calls/run` | `{plan}` | `{job_id, tasks:[{id,to_number,business_name}]}` |
| `GET /api/calls/{job_id}` | — | full job + tasks + results (for history + MCP polling) |
| `GET /api/configs` · `POST/PATCH` | persona/voice CRUD | |
| `GET /api/skills` · `POST/PATCH` | skill CRUD | |
| `GET /api/usage` | — | **mock** numbers (calls, minutes, $) |

### ElevenLabs → Django (must be on the public ngrok URL)
| Method · Path | Purpose | Auth |
|---|---|---|
| `POST /api/agent/tool` | **server tool** — agent reads `BusinessKnowledge` / writes `CallTask.result` | shared secret header |
| `POST /api/eleven/webhook` | **post-call** — store final transcript + extracted data | HMAC verify |

### MCP → Django
| Tool | Maps to |
|---|---|
| `start_calls(instruction, numbers[])` | `POST /api/calls/run` (auto-build plan server-side) |
| `get_results(job_id)` | `GET /api/calls/{job_id}` |

### WebSocket
`/ws/calls/{job_id}` — server→browser only. Reject anonymous (`close(4401)`).

---

## 7. WebSocket event contract (browser renders these)

Reuse Rufen's `useCallMonitor` taxonomy. Each frame: `{task_id, type, ...}`.

```jsonc
{"task_id":"t1","type":"status","status":"ringing"}
{"task_id":"t1","type":"transcript","role":"agent","text":"Hi, I'm calling to ask…"}
{"task_id":"t1","type":"transcript","role":"callee","text":"Sure, a men's cut is 25 euro."}
{"task_id":"t1","type":"tool_call","name":"save_result","args":{"price_cut":25}}   // optional mid-call flourish
{"task_id":"t1","type":"status","status":"completed"}                              // hangup (from polling)
{"task_id":"t1","type":"result","result":{"price_cut":25,"price_beard":12,"avail_pm":true}}  // a few s later, from post-call webhook
```
> **Ordering note:** the live `transcript`/`status` frames come from the **polling loop**; the authoritative `result` frame comes from the **post-call Data Collection webhook** and lands a few seconds *after* `completed`. The UI shows a "extracting…" spinner on the result chip between `completed` and `result`.

> **Honesty on "token streaming":** ElevenLabs streams **per-turn** (final user transcript + agent response, plus a *tentative* agent text), **not** token-by-token text. That still looks live and great. If you want a typing feel, animate the agent text client-side. Don't promise word-level streaming in the pitch.

---

## 8. ElevenLabs integration — the exact moving parts

> **✅ VERIFIED against live ElevenLabs docs (June 2026):**
> - **Live transcript by polling WORKS mid-call** — `GET /v1/convai/conversations/{id}` populates `transcript` incrementally while `status=in-progress`. (The dedicated monitor WebSocket is **Enterprise-only**, so polling is the right path anyway.)
> - **Haiku as the LLM is supported** — Claude Haiku 4.5 + Claude 3 Haiku are selectable. Set `conversation_config.agent.prompt.llm`. ⚠️ Get the exact identifier string from `GET /v1/convai/llm/list` (needs your key) before hardcoding.
> - **Per-call prompt override works** — but each override field (system prompt, first_message, language…) must be toggled ON in the agent's **Security** tab first, or the call **422s**. `dynamic_variables` need NO toggle → prefer them for per-call data.
> - **Reliable structured results = post-call Data Collection** (typed schema over full transcript), delivered in the post-call webhook at `analysis.data_collection_results`. Mid-call server tool is the *flourish*, not the source of truth.
> - **One agent runs parallel calls** (workspace-level concurrency). No per-agent serialization.

### One-time setup (do before the day if possible)
1. **Telnyx:** SIP Connection (FQDN/credentials), **transport = TLS or TCP (NOT UDP)**, allow **G711 + G722** codecs, attach an Outbound Voice Profile, assign your number. Point it at ElevenLabs ingress `sip.rtc.elevenlabs.io`.
2. **ElevenLabs:** import the number as a **SIP-trunk phone number** → get `agent_phone_number_id`. Set trunk Address to your Telnyx hostname (no `sip:` prefix). Auth = digest username/password.
3. **Create ONE agent per persona** (`POST /v1/convai/agents/create`) with `conversation_config`: `agent.prompt.prompt`, `agent.first_message`, `agent.language`, `tts.voice_id`, `agent.prompt.llm` (**= your Claude Haiku identifier from `GET /v1/convai/llm/list`**). Attach the **server tool** (`/api/agent/tool`) for mid-call DB read/write, and define **Data Collection items** (Analysis tab) for the typed fields you want extracted post-call. If you'll override the prompt/first_message per call, **enable those fields in the agent's Security tab** now.

### Per call (backend)
```
POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call
headers: { "xi-api-key": <KEY> }
body: {
  agent_id, agent_phone_number_id, to_number,
  conversation_initiation_client_data: {
     dynamic_variables: { business_name, our_company, ask_or_book, ... },  # NO security toggle needed
     conversation_config_override: {        # ONLY for fields enabled in Security tab, else 422
        agent: { prompt: { prompt }, first_message, language }
     }
  }
}
→ { conversation_id, sip_call_id }        # store conversation_id on CallTask immediately
```
Don't create an agent per call — **reuse the persona agent + per-call `dynamic_variables`** (the lighter, toggle-free path). Reserve full `prompt`/`first_message` override (via `conversation_config_override`) for when you truly swap the script — and remember each such field must be enabled in the agent's **Security** tab first.

### Live transcript (robust choice for flaky wifi: POLL, don't hold a WS to ElevenLabs)
```
loop every ~1s until terminal:
  GET /v1/convai/conversations/{conversation_id}
  diff transcript turns vs last seen → publish new turns to Redis channel
  call-stream:{job_id}   (CallStreamConsumer forwards to browser)
```
Polling is simpler and survives network blips better than a persistent WS. ~1–2s latency is fine for the demo. **(Verified: the transcript fills in while `status=in-progress`.)** The `conversation_id` comes back in the outbound-call response immediately, so you can start polling at once.

### Structured results — PRIMARY = post-call Data Collection (most reliable), tool = flourish
- **PRIMARY (the comparison table) → post-call Data Collection.** Define typed items (string/boolean/integer/number) in the agent's Analysis tab; ElevenLabs runs LLM extraction over the *full* transcript after hangup and delivers them in the **post-call webhook** at `data.analysis.data_collection_results`. Your `extraction_schema` (§5) maps 1:1 to these items. This is the reliable source of `CallTask.result`. **Timing:** results arrive a few seconds *after* each call ends (not mid-call) — so the chat streams the live transcript during the call, then the result chip + comparison-table row fill in on hangup. Build for that ordering.
- **FLOURISH / the "agent uses a DB live" story → mid-call server tool** `/api/agent/tool`: the agent **reads** `BusinessKnowledge` (e.g. your company name) and can **write** a provisional `save_result(...)` during the call. Great demo of mid-call tool use, but don't depend on it for the authoritative table — agents don't always call a tool with perfect args. Use post-call Data Collection as the source of truth.

### Concurrency reality
ElevenLabs concurrency is **per-workspace by plan**: Free 2, Creator(\$22) 5, Pro 10. Telnyx new accounts cap at **2 concurrent until Level-2 verification → 10**. **For a 3–4 parallel demo: be on ElevenLabs Creator+ AND Telnyx Level-2 verified.** (See `03-PREFLIGHT.md`.)

---

## 9. The TWO-PHASE chat: **Plan → Call** (your differentiator)

The chat is a deliberate two-phase agentic flow. **Phase 1 (Plan)** the app drives a back-and-forth like Claude does — it owns the conversation, asks the user whatever it needs, and converges on a complete call plan. **Phase 2 (Call)** starts only when the user says "go": the calls fire and the chat switches to live streaming. A clear state boundary keeps the UX legible and the demo crisp.

```
┌── PHASE 1: PLAN (agentic Q&A, app-driven) ──────────────┐
│ user: "call 3 barbers, men's cut + beard, free this pm" │
│ app : "Got it. Budget ceiling? Preferred time window?   │
│        Just ask, or try to book? Which 3 numbers?"      │
│ user: "...answers..."                                   │
│ app : (loops until complete) → shows EDITABLE PLAN CARD: │
│        skill, prompt, extraction fields, targets         │
│ user: clicks ▶ Run                                       │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌── PHASE 2: CALL (execute + live stream) ────────────────┐
│ N calls fire in parallel → streaming cards → results    │
│ → comparison table                                       │
└──────────────────────────────────────────────────────────┘
```

### Phase 1 engine — `POST /api/calls/build` (loops)
Runs a cheap cloud LLM (OpenAI/Anthropic — *not* ElevenLabs). It's a small agentic loop with two possible returns each turn:
- **Need more** → `{phase:"plan", need:[{key,question}], draft_plan?}` — the UI renders the question(s) as chat bubbles and waits.
- **Ready** → `{phase:"ready", plan:{skill, system_prompt, first_message, extraction_schema, targets}}` — the UI renders the **editable plan card** with a ▶ Run button.

System prompt (sketch): *"You are planning a phone call (or several). Converse with the user to gather only what changes how the call goes — budget, date/time window, the identity to use, ask-vs-book, and the target businesses/numbers. Ask one short batch of questions at a time. When you have enough, emit the final plan: an optimized agent prompt, a first message, and an explicit extraction schema (the exact fields to capture). Base it on the chosen Skill's template. Keep the prompt under ~800 tokens."*

Keep the loop **simple** — 1–3 question rounds max, then compose. The editable plan card is the safety valve (user can fix anything before the call).

### Over MCP — Claude **is** the planner (don't rebuild Phase 1)
When the trigger comes from Claude (or any provider) over MCP, **the calling AI does the Phase-1 ping-pong with its own user.** So the MCP tool skips Rufen's planner and goes straight to Phase 2:
- `start_calls(instruction, numbers[])` receives an *already-clarified* instruction. The backend does a single, silent compose pass (no questions — Claude already asked them) → runs the calls → returns `job_id`.
- This keeps the MCP surface "very simple, like an agentic flow": Claude clarifies → calls the tool → polls `get_results(job_id)`. The intelligence lives in whichever AI is driving, exactly as it should.

> One backend, two front-doors: the **web app** runs Phase 1 itself; **MCP clients** bring their own Phase 1. Both converge on the same Phase-2 `run` path.

---

## 10. MCP server (FastMCP, stdio) — `mcp_server.py`

```python
import httpx
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("rufen-ai")
BACKEND, SECRET = "https://<ngrok>.app", "<shared-secret>"

@mcp.tool()
async def start_calls(instruction: str, numbers: list[str]) -> str:
    """Place AI phone calls for a task and return a job id to poll."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BACKEND}/api/calls/run",
            json={"instruction": instruction, "numbers": numbers},
            headers={"X-Rufen-Secret": SECRET})
        r.raise_for_status()
        return r.json()["job_id"]

@mcp.tool()
async def get_results(job_id: str) -> dict:
    """Get transcripts + structured results for a job."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BACKEND}/api/calls/{job_id}",
            headers={"X-Rufen-Secret": SECRET})
        return r.json()

if __name__ == "__main__":
    mcp.run()   # stdio
```
Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{ "mcpServers": { "rufen": { "command": "python", "args": ["/abs/path/mcp_server.py"] } } }
```
**Rules:** never `print()` to stdout (corrupts JSON-RPC — log to stderr). Gate `/api/calls/run` with the shared secret + an **allowlist of destination numbers** so a stray Claude call can't dial arbitrary PSTN.

---

## 11. Build order — 6 hours, with a CUT LINE

> Solo. Optimize for a demo that proves the **core workflow** + **one parallel run** + **one MCP call**. Everything below the cut line is garnish.

| # | Block | ~Time | Output |
|---|---|---|---|
| 0 | **Preflight already done** (accounts, SIP, ngrok) | — | a number that can place a call |
| 1 | `docker compose up` (db/redis/web/frontend) + models + mock login + 1 hardcoded outbound call | 60m | a single real call connects end-to-end |
| 2 | `CallStreamConsumer` + per-call poller → WS; render ONE live transcript in a bare page | 60m | **live transcript on screen** (the spine) |
| 3 | `/api/calls/run` fan-out (N asyncio tasks) + parallel cards UI | 45m | **2–3 calls streaming side-by-side** |
| 4 | Server tool `/api/agent/tool` save_result + result cards + comparison table | 45m | **structured results + table** |
| 5 | Chat UI polish (ChatGPT look, sidebar history, your brand/colors) | 45m | "clean" demo |
| 6 | `/api/calls/build` interview (clarify + compose, editable plan card) | 40m | **the differentiator** |
| 7 | MCP server + Claude Desktop wired | 30m | **Claude triggers a call** |
| **— CUT LINE —** | *everything above must work before anything below* | | |
| 8 | AI Config page (persona + voice picker w/ ElevenLabs voices) | 30m | nice-to-have |
| 9 | Skills UI (pick/edit templates) | 25m | nice-to-have |
| 10 | Settings: MCP setup / Usage / Billing (mock) screens | 25m | pitch dressing |

**If you fall behind:** skip 8–10 entirely (persona/voice can be one hardcoded config; skills can be a hardcoded dropdown). **Never** sacrifice 1–4. Blocks 6 (interview) and 7 (MCP) are your two "wow" beats — protect at least one.

---

## 12. Pages / UI spec

- **`/` New Call** — ChatGPT layout: left sidebar (New Call + history of jobs), center chat. Input box at bottom. Interview Q&A renders as chat bubbles; compiled plan as an editable card; running calls as **streaming cards** (one per task) with a status pill, live transcript, and a result chip; final **comparison table** when >1 call.
- **`/config` AI Config** — persona name + prompt + **voice picker** (list ElevenLabs voices via `GET /v1/voices`, ▶ preview) + language. (Rufen has a `ProviderVoicePicker` pattern — rebuild a minimal version.)
- **`/skills` Skills** — cards for each skill; edit prompt template + extraction fields.
- **`/settings`** — tabs: **MCP setup** (show the `claude_desktop_config.json` snippet + secret), **Usage** (mock charts), **Billing** (mock plan + "Add funds" no-op), **Account** (mock).
- **Login** — clean email-only screen, accepts anything.

---

## 13. Branding & theme (your Rufen palette, exact tokens)

Copy these into the new app's `src/index.css` `@theme` + `:root`/`.dark`. **Use YOUR logos, not Rufen's mark** (swap in your `logo-*.svg` / `icon-*`).

```css
/* dark is the default vibe — black + orange */
--primary:            24 95% 53%;   /* #F97316  orange-500  */
--ring:               24 95% 53%;
--background (dark):  0 0% 4%;       /* #0A0A0A */
--card (dark):        0 0% 7%;       /* #121212 */
--border (dark):      0 0% 13%;      /* #212121 */
--foreground (dark):  0 0% 88%;      /* #E0E0E0 */
--muted-foreground:   240 5% 65%;    /* zinc-400 */
--primary-foreground: 0 0% 100%;     /* white text on orange */
--radius: 0.5rem;
```
Fonts: **Inter** (body), **JetBrains Mono** (transcript timestamps / latency), optional **Sora** (display headings, `-0.02em` tracking). Orange glow on cards = Rufen's `.glow-card` trick: `box-shadow: 0 0 20px hsl(24 95% 53% / 0.06)`.

Reference (DON'T ship Rufen's assets): `Rufen/marketing/public/brand/` and `Rufen/frontend/src/index.css`.

---

## 14. Network resilience (150 builders, bad wifi)

- **Run the whole demo on your hotspot**, not venue wifi. ElevenLabs SIP + your ngrok tunnel both need stable egress.
- **Polling > persistent WS** to ElevenLabs (already chosen) — survives blips.
- **Pre-record a 60–90s screen capture** of a perfect run (parallel calls + MCP). If the live call fails on stage, play it without missing a beat.
- **AI-to-AI fallback:** keep a second phone (or a second ElevenLabs agent) primed to answer, so you control both ends if you can't rely on a friend picking up. You chose "my/friends' phones" — line up **3 reachable people** and test them on the hotspot before you pitch.
- ngrok URL changes on restart → keep it up all day; if it dies, update the ElevenLabs tool URL + MCP `BACKEND` in one place.

---

## 15. Open items (answer in chat → I'll finalize)
- Your **logo files** path (name is set: **Rufen AI**).
- ElevenLabs plan/concurrency; Telnyx Level-2 status.
- Claude Desktop installed for the MCP beat?
- Want me to scaffold the actual repo (Django + Vite + compose) structure as a follow-up?

---

## 16. Docker Compose

Mirror the shape you know from Rufen, stripped to four services. The **MCP server and ngrok run on the host** (Claude Desktop spawns the MCP process via stdio; ngrok tunnels to the published `web` port).

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_DB: rufen, POSTGRES_USER: rufen, POSTGRES_PASSWORD: rufen }
    ports: ["127.0.0.1:5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7
    ports: ["127.0.0.1:6379:6379"]

  web:
    build: ./backend
    command: daphne -b 0.0.0.0 -p 8000 config.asgi:application   # ASGI for Channels
    environment:
      DATABASE_URL: postgres://rufen:rufen@db:5432/rufen
      REDIS_URL: redis://redis:6379/0
      ELEVENLABS_API_KEY: ${ELEVENLABS_API_KEY}
      ELEVEN_AGENT_PHONE_NUMBER_ID: ${ELEVEN_AGENT_PHONE_NUMBER_ID}
      PUBLIC_URL: ${PUBLIC_URL}          # the ngrok https URL (for server-tool + webhook)
      RUFEN_SHARED_SECRET: ${RUFEN_SHARED_SECRET}
    ports: ["8000:8000"]                 # host:8000 → MCP + ngrok hit this
    depends_on: [db, redis]

  frontend:
    build: ./frontend
    command: npm run dev -- --host 0.0.0.0 --port 3001
    ports: ["3001:3001"]
    depends_on: [web]

volumes: { pgdata: {} }
```

Notes:
- **Must run Daphne (ASGI)**, not `runserver`, so Channels WebSockets work. (Rufen lesson.)
- Frontend talks to the API at `http://localhost:8000/api/*` and WS at `ws://localhost:8000/ws/calls/{job}` (connect WS **straight to :8000** in dev — don't proxy WS through Vite; Rufen learned the Vite proxy drops WS data frames).
- **Cross-origin (3001→8000):** add `django-cors-headers` with `CORS_ALLOW_CREDENTIALS=True` + `CORS_ALLOWED_ORIGINS=["http://localhost:3001"]`, and `CSRF_TRUSTED_ORIGINS` likewise — or, for a hackathon, mock-auth with a **Bearer token in `Authorization`** (no cookies/CSRF at all) to sidestep it entirely.
- **Mock auth ↔ WebSocket:** since auth is faked, don't rely on cookies on the WS upgrade. On mock-login return a short token; the browser opens `ws://localhost:8000/ws/calls/{job}?token=...`; the consumer reads `scope["query_string"]`, accepts any non-empty token (mock), and `close(4401)` on empty. Keeps pitfall #14/#17 satisfied without real auth.
- **ngrok on host:** `ngrok http 8000` → put the `https://…` URL in `PUBLIC_URL` (used to register the ElevenLabs server-tool + post-call webhook). Restarting ngrok changes the URL → update `PUBLIC_URL` + re-point the ElevenLabs tool in one place.
- **MCP host venv:** `pip install "mcp[cli]" httpx`; point its `BACKEND` at `http://localhost:8000` (local demo) or the ngrok URL (claude.ai remote).
- Keep a `.env` next to the compose file for the secrets above. **Cost-savers for a hackathon:** Postgres+Redis are tiny; the only spend is ElevenLabs minutes (~$0.08–0.12/min) + Telnyx (~$0.005–0.007/min). A full demo is cents.
