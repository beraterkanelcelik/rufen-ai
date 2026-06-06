# 03 — Preflight (do BEFORE Saturday)

> Some items have approval/propagation lag (Telnyx verification, DNS, account limits). Doing these tonight is the difference between building at 09:00 and fighting telephony at 14:00.

## Accounts & telephony (highest lag — do first)
- [x] **Telnyx account + German number** — REUSING the verified account + verified DE number from Rufen. (Level-2 verification almost certainly already done → no wait.)
- [ ] **Confirm the concurrent-call limit** in the portal (account concurrency + channel limit on the SIP connection / Outbound Voice Profile). Need **≥5** for a 3–4 parallel demo. If it's still 2, raise the channel limit or email support@telnyx.com.
- [ ] **Create a SEPARATE SIP Connection for ElevenLabs outbound** — do NOT repoint Rufen's existing Asterisk connection (keep Rufen working). New FQDN/credentials connection: **transport TLS/TCP (not UDP)**, **G711 + G722** codecs, Outbound Voice Profile attached, outbound to `sip.rtc.elevenlabs.io`, reuse the DE number as caller ID.
- [ ] **Dial German destinations** in the demo (your/friends' DE mobiles) — cheapest + cleanest from a DE caller ID.
- [ ] **ElevenLabs account** + **API key**. Plan with enough concurrency: **Creator ($22) = 5** concurrent (Free = 2). Confirm your tier ≥ your parallel-demo count.
- [ ] **ElevenLabs ↔ Telnyx SIP trunk** linked: import number as SIP-trunk phone number → save `agent_phone_number_id`. Trunk Address = Telnyx hostname (no `sip:`). Point Telnyx at `sip.rtc.elevenlabs.io`.
- [ ] **Place ONE manual test call** through the trunk (ElevenLabs dashboard or a curl) — prove the path works *before* the hackathon.

## Tooling
- [ ] **ngrok** (or cloudflared) installed + authed. Test `ngrok http 8000`.
- [ ] **Claude Desktop** installed on the demo laptop. Know where the config lives: `~/Library/Application Support/Claude/claude_desktop_config.json`.
- [ ] **Host Python venv** with `mcp[cli]` + `httpx` for the MCP server.
- [ ] **Docker Desktop** running; pre-pull `postgres:16`, `redis:7`, `node`, `python` base images (saves bandwidth on bad wifi).
- [ ] An LLM API key for the **planning phase** (OpenAI or Anthropic) — the call-builder interview LLM.

## Assets & repo
- [ ] Your **Rufen AI logos** (light/dark SVG + icon) copied into a folder ready to drop into `frontend/public/`.
- [ ] **Fresh empty git repo** created (public, for submission) — first commit happens *Saturday*. Don't pre-commit code.
- [ ] Palette tokens from `00-DESIGN.md §13` pasted into a scratch `index.css`.

## Demo safety net
- [ ] **Hotspot** charged + tested (do NOT trust venue wifi for 150 builders).
- [ ] **3 reachable callees** lined up (you/friends) + tested answering on the hotspot.
- [ ] Plan to **screen-record a perfect run** mid-afternoon as the backup video.
- [ ] Destination-number **allowlist** ready (so the MCP/agent can't dial arbitrary numbers).

## Pitch prep (tonight)
- [ ] Write + say your **first sentence** out loud (`02-PITCH.md §1`).
- [ ] Draft the **7 slides** (`02-PITCH.md §6`) — your logo, black+orange, no TAM slide.
- [ ] Send the **early-access DM** to 8–10 AI builders (`02-PITCH.md §8`) — start collecting the one written "when can I try it."
- [ ] Decide your **recruiting line** (`02-PITCH.md §9`).

## Spend sanity
- A full demo is **cents**: ElevenLabs ~$0.08–0.12/min + Telnyx ~$0.005–0.007/min. Free ElevenLabs credits ≈ ~15 min. Top up ElevenLabs to Creator if you want 5 concurrent + headroom.

---

### 30-second smoke test you should be able to pass before Saturday
> From your laptop, trigger one outbound call via the ElevenLabs SIP API to your own phone, have a 20-second chat, and see the transcript in the ElevenLabs dashboard. If that works, the riskiest integration is already de-risked.
