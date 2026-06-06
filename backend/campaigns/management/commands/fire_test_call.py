"""Fire ONE real outbound call and stream the transcript — the quickest way to
prove the Telnyx↔ElevenLabs trunk works end to end.

  docker compose exec web python manage.py fire_test_call +49YOURNUMBER
  docker compose exec web python manage.py fire_test_call +49... --name "Berat" \
      --context "2021 BMW X5, airbag recall 23V-456"

Creates a throwaway demo agent (or pass --agent-id to reuse one), dials the
number via ELEVEN_AGENT_PHONE_NUMBER_ID, then polls the conversation and prints
each transcript turn until the call ends.
"""
import asyncio
import os

from django.core.management.base import BaseCommand, CommandError

from campaigns.eleven import create_agent, get_conversation, start_call

DEMO_PROMPT = (
    "You are a friendly AI assistant making a quick test call on behalf of the "
    "Rufen team. You are speaking with {name}. Their record: {context}. Briefly "
    "introduce yourself as an AI assistant, confirm they can hear you clearly, "
    "ask if now is a good time, thank them, and end the call. Keep it under 30 seconds."
)
DEMO_FIRST = "Hi {name}, this is a Rufen test assistant — can you hear me okay?"


class Command(BaseCommand):
    help = "Place one real outbound test call and stream the transcript"

    def add_arguments(self, parser):
        parser.add_argument("to_number", help="destination in E.164, e.g. +4915112345678")
        parser.add_argument("--name", default="there")
        parser.add_argument("--context", default="a quick connectivity test")
        parser.add_argument("--agent-id", default=None, help="reuse an existing agent")
        parser.add_argument("--voice-id", default=None, help="ElevenLabs voice id")
        parser.add_argument("--timeout", type=int, default=120)

    def handle(self, *args, **opts):
        if not os.environ.get("ELEVEN_AGENT_PHONE_NUMBER_ID"):
            raise CommandError("ELEVEN_AGENT_PHONE_NUMBER_ID is not set — finish the SIP import first.")
        try:
            asyncio.run(self._run(opts))
        except Exception as exc:
            raise CommandError(str(exc))

    async def _run(self, opts):
        agent_id = opts["agent_id"]
        if not agent_id:
            self.stdout.write("· creating throwaway test agent…")
            agent_id = await create_agent(
                name="Rufen — test call",
                system_prompt=DEMO_PROMPT,
                first_message=DEMO_FIRST,
                voice_id=opts["voice_id"] or "CwhRBWXzGAHq8TQ4Fs17",  # Roger
                language="en",
                data_collection=[],
            )
            self.stdout.write(f"  agent_id = {agent_id}")

        dyn = {"name": opts["name"], "context": opts["context"]}
        self.stdout.write(f"· dialing {opts['to_number']} … (your phone should ring)")
        res = await start_call(agent_id, opts["to_number"], dyn)
        cid = res.get("conversation_id")
        self.stdout.write(f"  conversation_id = {cid}")

        seen, status, elapsed = 0, "initiated", 0
        while status not in ("done", "failed") and elapsed < opts["timeout"]:
            data = await get_conversation(cid)
            status = data.get("status")
            transcript = data.get("transcript") or []
            for turn in transcript[seen:]:
                who = "CALLEE" if turn.get("role") == "user" else "AGENT "
                self.stdout.write(f"  [{who}] {turn.get('message')}")
            seen = len(transcript)
            if status in ("done", "failed"):
                break
            await asyncio.sleep(1)
            elapsed += 1

        self.stdout.write(self.style.SUCCESS(f"· call ended: status={status}"))
        analysis = (data.get("analysis") or {}).get("data_collection_results") or {}
        if analysis:
            self.stdout.write(f"  extracted: {analysis}")
