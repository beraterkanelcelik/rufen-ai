# Hackathon Plan — Agent-Native Parallel Calling

**Event:** AI BEAVERS × Mollie Founder Hackathon · House of AI, Hamburg · Sat **June 6, 2026** · submit by **19:00**.

Product name: **Rufen AI** (reusing your existing brand — judges don't know it; reusing a *name* is allowed, only importing the old *codebase* / demoing the existing product is not). Use your own logos.

> One line: *"Describe a phone job in plain English; Rufen AI interviews you for the missing details, then runs the call(s) in parallel and hands back structured, comparable answers — and any AI agent can trigger the same thing over MCP."*

## The four docs

| File | What it's for | When you read it |
|---|---|---|
| [`00-DESIGN.md`](./docs/00-DESIGN.md) | Architecture, stack, data model, API, WS contract, ElevenLabs/Telnyx/MCP integration, pages, branding, the **6-hour build order with a cut line**. | Before you write code. Keep open all day. |
| [`01-PITFALLS.md`](./docs/01-PITFALLS.md) | Every bug-prone area — Rufen lessons + ElevenLabs/Telnyx/MCP specifics — phrased as *watch-out-because-do*. | When something silently breaks (it will). |
| [`02-PITCH.md`](./docs/02-PITCH.md) | First sentence, wedge, 7-slide deck, rubric self-score, **evidence plan**, solo handling, the 3-minute script. **55% of your score lives here.** | Tonight + the last 90 min before pitching. |
| [`03-PREFLIGHT.md`](./docs/03-PREFLIGHT.md) | Do-these-before-Saturday checklist: accounts, Telnyx Level-2 verification, ngrok, hotspot, backup video. | **Tonight.** Some items have approval lag. |

## The five decisions already locked

1. **Voice = ElevenLabs Agents** (managed STT→LLM→TTS+tools+voice). No Asterisk, no Qwen worker, no media bridge.
2. **Telephony = Telnyx SIP trunk** → ElevenLabs. **One number is enough** for parallel calls.
3. **Backend = Django + Channels only.** No Temporal, no Langfuse. Parallel = asyncio background tasks.
4. **Auth + billing = mocked** (clean screens, no Stripe, no real metering).
5. **Frontend = React 19 + Vite + Tailwind 4 + shadcn**, built **fresh today** (not copied from Rufen — see integrity note in `02-PITCH.md`).
6. **Docker Compose** for the stack: `db` (Postgres 16) · `redis` · `web` (Django/Daphne) · `frontend` (Vite). MCP server + ngrok run on the host. See `00-DESIGN.md` §16.

## Still need from you (answer in chat)

- [ ] Your **logo files** (path on disk) — name is set to **Rufen AI**.
- [ ] **ElevenLabs** account + API key ready? Which plan (concurrency tier)?
- [ ] **Telnyx** account ready + **Level-2 verification started**? (concurrency cap — see preflight)
- [ ] **Claude Desktop** installed on your demo machine (for the MCP demo)?
