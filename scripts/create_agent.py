"""One-time helper that creates the Rufen ElevenLabs agent and prints its id.

Run on the HOST (not in compose):
    pip install httpx
    set -a; source .env; set +a
    python scripts/create_agent.py
Then copy the printed value into .env as ELEVEN_AGENT_ID.

NOTE: For the hackathon the agent already exists
(ELEVEN_AGENT_ID=agent_4801ktdymxn5e548z2zsxk66xyrw). Do NOT run this again unless
you intend to create a fresh agent.
"""
import os
import httpx

KEY = os.environ["ELEVENLABS_API_KEY"]
body = {
    "name": "Rufen Caller",
    "conversation_config": {
        "agent": {
            "first_message": "Hi! I'm an assistant calling on behalf of a customer. Do you have a quick moment?",
            "language": "en",
            "prompt": {
                "prompt": (
                    "You are a polite assistant making a short phone call to a business "
                    "to ask specific questions. Ask the questions clearly, confirm the "
                    "answers, keep it under 90 seconds, then thank them and end."
                ),
                "llm": os.environ.get("ELEVEN_LLM", "claude-haiku-4-5"),
            },
        },
        "tts": {"voice_id": "JBFqnCBsd6RMkjVDRZzb"},  # pick any from GET /v1/voices
    },
}
r = httpx.post(
    "https://api.elevenlabs.io/v1/convai/agents/create",
    json=body,
    headers={"xi-api-key": KEY},
    timeout=30,
)
r.raise_for_status()
print("ELEVEN_AGENT_ID=", r.json()["agent_id"])
