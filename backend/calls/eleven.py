import os
import httpx

BASE = "https://api.elevenlabs.io/v1"


def _headers():
    return {"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}


async def start_call(to_number, dynamic_variables=None):
    body = {
        "agent_id": os.environ["ELEVEN_AGENT_ID"],
        "agent_phone_number_id": os.environ["ELEVEN_AGENT_PHONE_NUMBER_ID"],
        "to_number": to_number,
    }
    if dynamic_variables:
        body["conversation_initiation_client_data"] = {"dynamic_variables": dynamic_variables}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/convai/sip-trunk/outbound-call", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()  # {success, conversation_id, sip_call_id}


async def get_conversation(conversation_id):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}/convai/conversations/{conversation_id}", headers=_headers())
        r.raise_for_status()
        return r.json()  # {status, transcript:[{role,message,time_in_call_secs}], ...}
