# Importing the Telnyx number into ElevenLabs (click-by-click)

**Goal:** wire your DE number `+4934156154530` so ElevenLabs Agents can place **outbound** calls through Telnyx → PSTN. Output: the **`ELEVEN_AGENT_PHONE_NUMBER_ID`** value for `.env` (the one blank gating real calls).

**Path:** ElevenLabs places the call → SIP INVITE → **Telnyx** (authenticates ElevenLabs, bills the PSTN leg) → customer's phone.

> ⚠️ **Do NOT touch Rufen's existing Asterisk SIP connection.** Create a brand-new connection below with **new** credentials. (Verified against the live ElevenLabs docs, June 2026 — see Sources.)

---

## Part A — Telnyx (portal.telnyx.com)

1. **Voice → SIP Trunking → Create SIP Connection.** Choose connection type **FQDN**. Name it `elevenlabs-outbound`. Save.
2. Open the connection → **Authentication & Routing**:
   - Select **Outbound Calls Authentication**.
   - **Authentication Method → Credentials.** Enter a **new username + password** (write them down — ElevenLabs needs the exact same pair). *Don't reuse the Rufen/Asterisk creds.*
   - Under **FQDN**, click **Add FQDN** and enter: **`sip.rtc.elevenlabs.io`**
3. **Outbound** tab → **Outbound Voice Profile**: select an existing profile or **create one** (this authorizes + bills the PSTN termination). Make sure it allows **Germany / international** destinations you'll dial.
4. **Inbound** / transport: signaling uses **TCP** (ElevenLabs supports TCP or TLS — **not UDP**). Leave TCP unless you deliberately set up TLS.
5. **Numbers** tab → **assign `+4934156154530`** to this `elevenlabs-outbound` connection (this is the outbound caller ID).

> Codecs: ElevenLabs sends/receives **G711 (8kHz)** or **G722 (16kHz)** — Telnyx supports these by default; no action usually needed.

---

## Part B — ElevenLabs (Agents dashboard)

6. **Agents → Phone Numbers → "Import a phone number from SIP trunk".** Fill the dialog:

| Field | Value |
|---|---|
| **Label** | `Rufen DE` (any name) |
| **Phone Number** | `+4934156154530` (E.164) |
| **Transport Type** | **TCP** (or TLS). **NOT UDP** — it's unsupported. |
| **Media Encryption** | **Allowed** for TCP. (If you chose TLS in Telnyx, set **Required**.) |
| **Address** | `sip.telnyx.com` — **hostname only**, no `sip:` prefix, no full URI. |
| **Authentication** | **Digest** → the **username + password** you set in step 2. (Leave empty only if you instead want ACL/IP allowlist auth.) |

7. **Save.** The number now appears in the Phone Numbers list, linked to your SIP trunk.

---

## Part C — Get `ELEVEN_AGENT_PHONE_NUMBER_ID`

**UI:** click the imported number → its id is shown (often in the URL / details panel).

**API (reliable):**
```bash
curl -s https://api.elevenlabs.io/v1/convai/phone-numbers \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | python3 -m json.tool
```
Copy the `phone_number_id` for `+4934156154530` → put it in `.env`:
```
ELEVEN_AGENT_PHONE_NUMBER_ID=<that id>
```

---

## Part D — Verify (one real call)
Place a test outbound call to a phone you'll answer:
```bash
curl -s -X POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"agent_id":"agent_4801ktdymxn5e548z2zsxk66xyrw",
       "agent_phone_number_id":"'"$ELEVEN_AGENT_PHONE_NUMBER_ID"'",
       "to_number":"+49YOURPHONE"}'
```
Expected: `{"success":true,"conversation_id":"...","sip_call_id":"..."}` and your phone rings. ✅ Done — the campaign engine can now dial.

---

## Troubleshooting
- **Call fails to connect / no audio:** transport mismatch — confirm **TCP (or TLS) on both sides, never UDP**; confirm codecs allow **G711/G722**.
- **401 / auth rejected:** the ElevenLabs **username/password must exactly match** the Telnyx connection credentials (step 2 ↔ step 6).
- **"Temporarily unavailable" / route fails:** the **Outbound Voice Profile** (step 3) isn't attached or doesn't allow the destination country.
- **Caller ID wrong / rejected:** the number must be **assigned to this connection** (step 5).
- **TLS chosen:** then Media Encryption must be **Required** on the ElevenLabs side.
- **SIP 480 on a specific number:** that handset was unreachable/off at dial time — it's destination-side, not config. Other numbers on the same trunk still connect.
- **Robotic / "electronical" audio:** the SIP connection was offering **G729** (compressed). Remove it — keep only **G722, G711A, G711U** (`PATCH /v2/fqdn_connections/{id}` → `inbound.codecs`). Realistic ceiling on a mobile PSTN leg is clean G711 (8 kHz); G722 wideband only if the whole path is HD.
- **Agent says the placeholder literally (e.g. "Hi {name}"):** ElevenLabs dynamic variables use **double braces** `{{name}}` / `{{context}}` — single braces are NOT substituted. (Fixed in `generator.py` + `fire_test_call`.)

---

### Sources (verified June 2026)
- [ElevenLabs — Telnyx SIP trunking](https://elevenlabs.io/docs/eleven-agents/phone-numbers/telephony/telnyx)
- [ElevenLabs — SIP trunking (import dialog fields)](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking)
- [ElevenLabs — Connect Telnyx integration](https://elevenlabs.io/agents/integrations/telnyx)
