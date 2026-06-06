"""Seed realistic demo data so the UI shows real backend content immediately.

  docker compose exec web python manage.py seed_demo --reset

Creates a finished BMW-recall campaign (rich outcomes + extracted results +
transcripts) and a running insurance-renewal campaign (pending contacts) you can
drive live with `simulate_run`.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from campaigns.models import Campaign, CallAttempt, CampaignContact

BMW_SCHEMA = [
    {"key": "agreed_to_book", "type": "boolean", "desc": "Did the customer agree to book the recall service?"},
    {"key": "preferred_date", "type": "string", "desc": "Preferred date/time window, else empty."},
    {"key": "callback_needed", "type": "boolean", "desc": "Did they ask to be called back later?"},
    {"key": "notes", "type": "string", "desc": "Any other relevant detail."},
]


class Command(BaseCommand):
    help = "Seed demo campaigns + contacts"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="wipe existing campaigns first")

    def handle(self, *args, **opts):
        if opts["reset"]:
            Campaign.objects.all().delete()
            self.stdout.write("· wiped existing campaigns")
        elif Campaign.objects.exists():
            self.stdout.write("campaigns already exist; pass --reset to reseed")
            return

        now = timezone.now()

        # ── Finished BMW recall campaign (rich data) ──────────────────────────
        bmw = Campaign.objects.create(
            name="BMW X5 Airbag Recall — Hamburg",
            goal="Get owners to book a free recall service appointment.",
            reason="Airbag recall 23V-456 — inflator may deploy improperly.",
            status="completed",
            script_prompt=("You are a polite assistant calling on behalf of a BMW service centre. "
                           "You are speaking with {name}. Their record: {context}. Explain the open "
                           "safety recall and offer to book a free service appointment. Identify as AI."),
            first_message="Hello {name}, this is an assistant calling on behalf of your BMW service centre — do you have a quick moment?",
            extraction_schema=BMW_SCHEMA,
            voice_id="voice_lukas", language="en",
            concurrency=2, retry_delay_minutes=60, max_attempts=3,
            retry_on=["no_answer", "busy", "failed"],
            eleven_agent_id="agent_demo_bmw",
            started_at=now - timedelta(hours=2), finished_at=now - timedelta(hours=1),
        )
        rows = [
            ("Berat Elcelik", "+4915112345670", "2021 BMW X5 — recall 23V-456",
             "completed", 1, "answered",
             {"agreed_to_book": True, "preferred_date": "next Tuesday afternoon",
              "callback_needed": False, "notes": "Prefers Hamburg-Altona branch."},
             [("agent", "Hello Berat, calling about your BMW X5 recall — got a moment?"),
              ("callee", "Yes, what's this about?"),
              ("agent", "There's an open airbag recall; can I book you a free service?"),
              ("callee", "Sure, next Tuesday afternoon works."),
              ("agent", "Booked — thank you!")]),
            ("Lena Hoffmann", "+4915112345671", "2019 BMW 3 Series — same recall",
             "completed", 2, "answered",
             {"agreed_to_book": True, "preferred_date": "Saturday morning",
              "callback_needed": False, "notes": ""},
             [("agent", "Hi Lena, it's about your BMW recall."),
              ("callee", "Okay, Saturday morning then."),
              ("agent", "Great, all set.")]),
            ("Markus Weber", "+4915112345672", "2020 BMW X3 — recall 23V-456",
             "completed", 1, "answered",
             {"agreed_to_book": False, "preferred_date": "",
              "callback_needed": True, "notes": "Travelling; call back in two weeks."},
             [("agent", "Hello Markus, regarding your BMW recall."),
              ("callee", "I'm abroad right now, call me in two weeks.")]),
            ("Sofia Klein", "+4915112345673", "2018 BMW 5 Series — recall",
             "exhausted", 3, "no_answer", {}, []),
            ("Jonas Becker", "+4915112345674", "2022 BMW X5 — recall",
             "failed", 1, "failed", {}, []),
        ]
        for name, phone, ctx, st, attempts, outcome, result, turns in rows:
            contact = CampaignContact.objects.create(
                campaign=bmw, name=name, phone=phone, context=ctx, language="en",
                status=st, attempts=attempts, last_outcome=outcome, result=result,
            )
            if turns:
                CallAttempt.objects.create(
                    contact=contact, attempt_no=attempts,
                    conversation_id=f"conv_demo_{contact.id}", outcome=outcome,
                    transcript=[{"role": r, "text": t, "time_in_call_secs": i * 4}
                                for i, (r, t) in enumerate(turns)],
                    started_at=now - timedelta(hours=2), ended_at=now - timedelta(hours=2),
                )

        # ── Running campaign for live simulation ──────────────────────────────
        ins = Campaign.objects.create(
            name="Insurance Renewal — Q3 Reminders",
            goal="Remind customers their policy is up for renewal and confirm interest.",
            reason="Q3 auto-renewal wave; reduce churn with a personal reminder.",
            status="running",
            script_prompt=("You are a friendly assistant from an insurance provider calling {name}. "
                           "Record: {context}. Remind them their policy is up for renewal and ask if "
                           "they'd like to continue. Identify as AI."),
            first_message="Hi {name}, quick courtesy call about your insurance renewal — is now okay?",
            extraction_schema=[
                {"key": "wants_renewal", "type": "boolean", "desc": "Do they want to renew?"},
                {"key": "callback_needed", "type": "boolean", "desc": "Call back later?"},
            ],
            voice_id="voice_rachel", language="en",
            concurrency=2, retry_delay_minutes=30, max_attempts=3,
            retry_on=["no_answer", "busy", "failed"],
            eleven_agent_id="agent_demo_ins",
            started_at=now,
        )
        for name, phone, ctx in [
            ("Anna Schmidt", "+4915122345670", "Policy KFZ-8841 renews 30 Jun; 3 yrs no claims"),
            ("Tom Fischer", "+4915122345671", "Policy KFZ-9920 renews 02 Jul; added a second driver"),
            ("Mia Wagner", "+4915122345672", "Policy KFZ-7733 renews 05 Jul; premium up 4%"),
            ("Paul Richter", "+4915122345673", "Policy KFZ-6610 renews 09 Jul"),
        ]:
            CampaignContact.objects.create(
                campaign=ins, name=name, phone=phone, context=ctx, language="en",
                status="pending", attempts=0,
            )

        self.stdout.write(self.style.SUCCESS(
            f"seeded: campaign {bmw.id} (BMW, completed) + campaign {ins.id} (Insurance, running)"))
