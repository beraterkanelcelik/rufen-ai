# 01 — Implementation Pitfalls

> Battle scars from Rufen + the new ElevenLabs/Telnyx/MCP surface. Each is **watch-out-because → do**. Skim now; grep when something breaks silently.

## ElevenLabs / Telnyx / SIP

1. **UDP transport fails silently** — ElevenLabs rejects UDP; Telnyx defaults to UDP signaling. → Set the Telnyx SIP connection to **TLS (preferred) or TCP**, and match on the ElevenLabs side.
2. **Codec mismatch = call connects then dies** — ElevenLabs only does **G711 (PCMU/PCMA) + G722**. → Allow exactly those on the Telnyx connection.
3. **Trunk Address format** — ElevenLabs wants the **hostname only** (e.g. `sip.telnyx.com`), **no `sip:` prefix, no full URI**. → Enter bare hostname.
4. **Concurrency cap bites at the worst moment** — Telnyx new accounts = **2 concurrent calls** until Level-2 verification (→10); ElevenLabs concurrency is **per-workspace by plan** (Free 2 / Creator 5 / Pro 10). → Verify Telnyx Level-2 **and** be on ElevenLabs Creator+ before a 3–4 parallel demo. The bottleneck is whichever is lower.
5. **`output_format` ignored as a body field** (if you ever call TTS directly) — pass it as a **query param**, or you get MP3 when you asked for PCM (sounds like noise). Check bytes don't start with `ID3`/`0xFFFB`.
6. **Scribe STT 400s on <0.5s audio** (`audio_too_short`) — only relevant if you do your own STT; ElevenLabs Agents handles this internally.
7. **"Answered" ≠ real answer** — voicemail "answers" the SIP leg and the agent starts talking to a recording, burning minutes. → Trust **ElevenLabs' own answered/AMD signal**, and **cap max call duration** (e.g. 90s) so a voicemail can't run forever.
8. **Caller ID must be your owned Telnyx number** — you can't spoof; use the assigned DID.
9. **Per-turn, not token-level** — the conversation stream gives final user transcript + agent response + a *tentative* agent text, **not** word-by-word text. → Don't promise token streaming; animate client-side if you want a typing feel.

## MCP

10. **Never `print()` in a stdio MCP server** — stdout is the JSON-RPC channel; any print corrupts it. → Log to **stderr** or a file.
11. **Absolute paths in `claude_desktop_config.json`** — `command`/`args` must point to a Python that actually has `mcp` installed (use a venv's python or `uv run`). Restart Claude Desktop after editing.
12. **`make_call`/`start_calls` dials real billable PSTN** — a stray model call = real money + spam risk. → Require the **shared-secret header** AND an **allowlist of destination numbers** server-side.
13. **claude.ai (web) can't spawn local processes** — it needs a **remote** MCP over HTTPS (`mcp.run(transport="streamable-http")` + ngrok) and expects OAuth (or at least a secret). → For the demo, prefer **Claude Desktop + stdio** (zero networking).

## Channels / WebSocket

14. **Reject anonymous sockets** — check auth in `connect()` and `self.close(code=4401)` otherwise; wrap ASGI with `AllowedHostsOriginValidator` (CSWSH). Even mocked auth should set a session so the WS can identify the user.
15. **Must run Daphne/ASGI, not `runserver`** — WebSockets won't work under WSGI. (In compose: `command: daphne … config.asgi:application`.)
16. **Don't proxy WS through Vite** — Vite's dev proxy mangles/drops WS data frames. → Connect the browser WS **straight to `ws://localhost:8000/ws/...`**.
17. **Cross-port cookie drops** — Chrome (esp. incognito) drops cookies on a different port. → Either go same-origin via a `buildWsUrl` helper, or (mocked auth) pass a token in the WS query string so you don't depend on cookies.
18. **Binary WS frames get mangled through Channels** — if you ever push audio to the browser, **base64 inside JSON**. (For this app you only push text turns, so n/a — but know it.)

## Redis cross-process

19. **Write the correlation key BEFORE you originate** — the poller/consumer may look up job/task state instantly. → Create `CallJob`/`CallTask` rows + any Redis keys first, *then* call ElevenLabs.
20. **`django_cache.set()` adds a `:1:` prefix** — a second process reading raw Redis won't find the key. → Use a **raw redis client** for any cross-process keys (your poller→consumer channel). Agree on raw-vs-framework on both ends.
21. **Pub/sub listener needs reconnect** — the `CallStreamConsumer`'s Redis subscribe loop should run in a background task with try/except + re-subscribe (Rufen's `_listen_transcript_events` pattern).

## Django / data

22. **Wrap state mutations in `transaction.atomic()`** — job/task status flips under concurrency. Use `select_for_update()` if two things might touch the same task row.
23. **Stuck-call janitor** — a lost hangup leaves a task `ringing`/`in_progress` forever. → A simple sweep (or a per-task `asyncio.wait_for` timeout) marks tasks older than ~5 min as `failed`. Also enforce a hard **max-duration** on the ElevenLabs call.
24. **Never return `str(e)` in API responses** — return a generic message, log the detail server-side. (Cheap habit; reviewers/judges may peek at the repo.)
25. **Validate tool args from ElevenLabs** — the `/api/agent/tool` body is attacker-shaped in principle. Validate against the skill's `extraction_schema` (a tiny Pydantic model) before writing `CallTask.result`.

## Frontend

26. **`crypto.randomUUID()` is undefined on plain-HTTP origins** — generating client ids on `http://localhost` may throw. → Fall back to `getRandomValues`/`Math.random`.
27. **RQ v5 + StrictMode drops per-`mutate()` callbacks** on unmount — put navigation/side-effects in **hook-level `onSuccess`**, not in the `.mutate(_, {onSuccess})` arg.
28. **Diff transcript by a stable turn key** — when polling ElevenLabs every ~1s you'll re-receive earlier turns; key turns by index/id and only append new ones, or the chat duplicates lines.

## Demo-day meta

29. **ngrok URL changes on restart** — keep it up all day; centralize it in one env var (`PUBLIC_URL`) so re-pointing the ElevenLabs tool + MCP backend is a one-line change.
30. **Run on your hotspot**, pre-record a perfect run, and line up **3 reachable callees** tested on that hotspot before you pitch (venue wifi will betray you).
