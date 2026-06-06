#!/usr/bin/env python3
"""
create_campaign_agent.py — create a per-campaign ElevenLabs Agent.

Builds an agent from a campaign's AI-generated script + extraction schema:
  • conversation_config.agent.prompt {prompt, llm}  (in-call LLM = claude-haiku-4-5)
  • conversation_config.agent.first_message / language
  • conversation_config.tts.voice_id
  • platform_settings.data_collection  → the typed fields extracted post-call,
    returned later at  GET /v1/convai/conversations/{id} → analysis.data_collection_results

Used at campaign LAUNCH (Slice 4). The core `create_campaign_agent()` function is
copy-paste ready into backend/campaigns/eleven.py.

Run standalone to smoke-test the data-collection payload path:
    set -a; source .env; set +a
    python scripts/create_campaign_agent.py

Requires: httpx  +  ELEVENLABS_API_KEY (and optionally ELEVEN_LLM) in the env.

✅ CONFIRMED against the live API (June 2026): data collection lives at
   platform_settings.data_collection = { key: {type, description} }.
   Read back, each item expands to {type, description, enum, dynamic_variable,
   constant_value, is_omitted, llm, is_system_provided} — the defaults are fine.
   Results return later at  GET /v1/convai/conversations/{id} → analysis.data_collection_results.
   Fallback if ever needed: omit data_collection here and add items in the dashboard
   (Agent → Analysis → Data collection).
   Sources: https://elevenlabs.io/docs/api-reference/agents/create
            https://elevenlabs.io/docs/agents-platform/customization/agent-analysis/data-collection
"""
import os
import sys
import json
import httpx

BASE = "https://api.elevenlabs.io/v1"
DEFAULT_VOICE = "CwhRBWXzGAHq8TQ4Fs17"  # "Roger" — exists in this workspace; swap as desired
# ElevenLabs data-collection allowed types:
ALLOWED_TYPES = {"string", "boolean", "integer", "number"}


def build_data_collection(extraction_schema):
    """[{key,type,desc}] → {key: {"type":..., "description":...}} for platform_settings.data_collection.

    Unknown/over-rich types are coerced to the 4 ElevenLabs-allowed primitives.
    """
    coerce = {"str": "string", "text": "string", "bool": "boolean",
              "int": "integer", "float": "number", "date": "string"}
    out = {}
    for item in extraction_schema or []:
        key = item["key"]
        t = item.get("type", "string")
        t = coerce.get(t, t)
        if t not in ALLOWED_TYPES:
            t = "string"
        out[key] = {"type": t, "description": item.get("desc") or item.get("description") or key}
    return out


def create_campaign_agent(
    name,
    system_prompt,
    first_message,
    extraction_schema,
    voice_id=DEFAULT_VOICE,
    language="en",
    api_key=None,
    in_call_llm=None,
):
    """Create an ElevenLabs agent for a campaign. Returns agent_id (str).

    Raises httpx.HTTPStatusError on failure (prints the response body first).
    """
    api_key = api_key or os.environ["ELEVENLABS_API_KEY"]
    in_call_llm = in_call_llm or os.environ.get("ELEVEN_LLM", "claude-haiku-4-5")

    payload = {
        "name": name,
        "conversation_config": {
            "agent": {
                "first_message": first_message,
                "language": language,
                "prompt": {"prompt": system_prompt, "llm": in_call_llm},
            },
            "tts": {"voice_id": voice_id},
        },
        # ⚠️ see VERIFY note in the module docstring
        "platform_settings": {
            "data_collection": build_data_collection(extraction_schema),
        },
    }

    with httpx.Client(timeout=30) as client:
        r = client.post(
            f"{BASE}/convai/agents/create",
            json=payload,
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
        )
        if r.status_code != 200:
            # Don't leak the key; surface the API error so the caller can adjust the payload.
            print(f"[create_campaign_agent] HTTP {r.status_code}: {r.text}", file=sys.stderr)
            r.raise_for_status()
        return r.json()["agent_id"]


# --------------------------------------------------------------------------- #
# Standalone smoke test — a BMW-recall-style campaign agent.
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    DEMO_PROMPT = (
        "You are a polite assistant calling on behalf of a BMW service centre. "
        "You are speaking with {name}. Their record: {context}. "
        "Goal: explain there is an open safety recall on their vehicle and offer to book a "
        "free service appointment. Confirm whether they want to book and, if so, a rough date "
        "or time window. Keep it under 90 seconds. Identify yourself as an AI assistant. "
        "Thank them and end the call politely."
    )
    DEMO_FIRST = "Hello {name}, this is an assistant calling on behalf of your BMW service centre — do you have a quick moment?"
    DEMO_SCHEMA = [
        {"key": "agreed_to_book", "type": "boolean", "desc": "Did the customer agree to book a recall service appointment?"},
        {"key": "preferred_date", "type": "string", "desc": "Any date or time window the customer preferred, else empty."},
        {"key": "callback_needed", "type": "boolean", "desc": "Did the customer ask to be called back later?"},
        {"key": "notes", "type": "string", "desc": "Any other relevant detail from the call."},
    ]

    try:
        agent_id = create_campaign_agent(
            name="Rufen Campaign — BMW recall (demo)",
            system_prompt=DEMO_PROMPT,
            first_message=DEMO_FIRST,
            extraction_schema=DEMO_SCHEMA,
        )
        print("ELEVEN_AGENT_ID(demo) =", agent_id)
        print("data_collection sent:", json.dumps(build_data_collection(DEMO_SCHEMA), indent=2))
    except KeyError:
        sys.exit("Set ELEVENLABS_API_KEY (e.g.  set -a; source .env; set +a)")
