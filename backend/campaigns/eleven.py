"""ElevenLabs Conversational-AI client (async, used from Temporal activities).

Verified facts (June 2026):
  • Place a call:  POST /v1/convai/sip-trunk/outbound-call  → {conversation_id} immediately.
  • Poll transcript/status:  GET /v1/convai/conversations/{id}
        status ∈ initiated | in-progress | processing | done | failed
        transcript = [{role, message, time_in_call_secs}]
  • Per-campaign agent:  POST /v1/convai/agents/create
        conversation_config.agent.prompt {prompt, llm}, .first_message/.language,
        conversation_config.tts.voice_id,
        platform_settings.data_collection = { key: {type, description} }  ← CONFIRMED path
  • Structured results return post-call at GET conversation → analysis.data_collection_results.
"""
import os

import httpx

BASE = "https://api.elevenlabs.io/v1"
DEFAULT_VOICE = "CwhRBWXzGAHq8TQ4Fs17"  # "Roger" — exists in this workspace
ALLOWED_TYPES = {"string", "boolean", "integer", "number"}


def _h():
    return {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}


def build_data_collection(extraction_schema):
    """[{key,type,desc}] → {key: {"type":..., "description":...}} for platform_settings.

    Unknown/over-rich types are coerced to the 4 ElevenLabs-allowed primitives.
    """
    coerce = {
        "str": "string", "text": "string", "bool": "boolean",
        "int": "integer", "float": "number", "date": "string",
    }
    out = {}
    for item in extraction_schema or []:
        key = item["key"]
        t = coerce.get(item.get("type", "string"), item.get("type", "string"))
        if t not in ALLOWED_TYPES:
            t = "string"
        out[key] = {"type": t, "description": item.get("desc") or item.get("description") or key}
    return out


async def start_call(agent_id, to_number, dynamic_variables):
    """Place an outbound call over the Telnyx SIP trunk. Returns the API JSON
    (includes ``conversation_id``)."""
    body = {
        "agent_id": agent_id,
        "agent_phone_number_id": os.environ["ELEVEN_AGENT_PHONE_NUMBER_ID"],
        "to_number": to_number,
        "conversation_initiation_client_data": {"dynamic_variables": dynamic_variables},
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/convai/sip-trunk/outbound-call", json=body, headers=_h())
        r.raise_for_status()
        return r.json()


def list_voices():
    """Sync: list the workspace's ElevenLabs voices for the wizard picker.
    Returns [{id, name, accent, desc, preview_url}]."""
    with httpx.Client(timeout=30) as c:
        r = c.get(f"{BASE}/voices", headers=_h())
        r.raise_for_status()
        voices = r.json().get("voices", [])
    out = []
    for v in voices:
        labels = v.get("labels") or {}
        out.append({
            "id": v.get("voice_id"),
            "name": v.get("name"),
            "accent": labels.get("accent", ""),
            "desc": labels.get("description") or v.get("category") or "",
            "preview_url": v.get("preview_url"),
        })
    return out


async def get_conversation(cid):
    """Fetch a conversation (status, transcript, analysis.data_collection_results)."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/convai/conversations/{cid}", headers=_h())
        r.raise_for_status()
        return r.json()


async def create_agent(name, system_prompt, first_message, voice_id, language, data_collection):
    """Create a per-campaign agent. ``data_collection`` is the extraction schema
    ([{key,type,desc}]); it is coerced to the platform_settings shape. Returns agent_id."""
    body = {
        "name": name,
        "conversation_config": {
            "agent": {
                "first_message": first_message,
                "language": language,
                "prompt": {
                    "prompt": system_prompt,
                    "llm": os.environ.get("ELEVEN_LLM", "claude-haiku-4-5"),
                },
            },
            "tts": {"voice_id": voice_id or DEFAULT_VOICE},
        },
        "platform_settings": {"data_collection": build_data_collection(data_collection)},
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/convai/agents/create", json=body, headers=_h())
        r.raise_for_status()
        return r.json()["agent_id"]
