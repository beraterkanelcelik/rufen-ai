# Rufen × Cara8 — Outbound AI Calling Campaigns

**Event:** AI BEAVERS × Mollie Founder Hackathon · House of AI, Hamburg · Sat **June 6, 2026** · submit by **19:00**. 2-person team (backend + UX in parallel).

> One line: *"Upload an Excel of customers, describe the goal once, and an AI call team works the whole list in parallel — retrying no-answers — and hands back a structured result per customer."* Concrete wedge: an automotive recall team calling 50 owners individually to book service.

## Docs

| File | What's in it |
|---|---|
| [`docs/00-DESIGN.md`](./docs/00-DESIGN.md) | Concept, data model, wizard, **Temporal workflows**, API, ElevenLabs integration, build order + cut line. |
| [`docs/plan/2026-06-06-rufen-campaign.md`](./docs/plan/2026-06-06-rufen-campaign.md) | **Backend-first** step-by-step implementation plan (execute this with Claude Code). |
| [`docs/01-PITFALLS.md`](./docs/01-PITFALLS.md) | Bug-prone areas (Temporal, Channels, ElevenLabs/Telnyx) as *watch-out-because-do*. |
| [`docs/03-PREFLIGHT.md`](./docs/03-PREFLIGHT.md) | Account/SIP setup checklist. |
| `docs/02-PITCH.md` | Pitch/strategy (local only, gitignored). |
| [`CLAUDE.md`](./CLAUDE.md) | Always-loaded operating manual for the build. |

## Locked decisions

1. **Build fresh** (hackathon integrity) — reuse Rufen *patterns/knowledge* only, never its code.
2. **Backend = Django 5 + DRF + Channels + Daphne**, Postgres + Redis.
3. **Engine = Temporal** — durable campaign workflows: concurrency + delay/max-attempt retry.
4. **Voice = ElevenLabs Agents** (in-call LLM `claude-haiku-4-5`) over a **Telnyx SIP trunk** (`+4934156154530`).
5. **Orchestration LLM = Claude/GPT** (script + extraction generation) — `ORCHESTRATOR_PROVIDER`.
6. **Excel = fixed schema** `name, phone, context, language` (template: `examples/contacts_example.csv`).
7. **Auth + billing mocked.** Concurrency capped at the account max (2 Free / 5 Creator).
8. **Docker Compose:** `db · redis · temporal · temporal-ui · web · temporal-worker`.

## Open items

- [ ] Finish **Telnyx SIP → ElevenLabs import** → set `ELEVEN_AGENT_PHONE_NUMBER_ID` (the one pending blocker).
- [ ] Put your + teammate's **real phone numbers** in `examples/contacts_example.csv`.
- [ ] Your **logo files** for the UI.
