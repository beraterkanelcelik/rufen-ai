"""Drive a live monitor run WITHOUT telephony — publishes real frames through the
real Redis channel so the WebSocket consumer forwards them to the open monitor.

  docker compose exec web python manage.py simulate_run <campaign_id>
  docker compose exec web python manage.py simulate_run <campaign_id> --reset --delay 1.2

Open the campaign's monitor page first, then run this and watch it stream.
"""
import json
import os
import time

import redis
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from campaigns.models import Campaign, CallAttempt, CampaignContact

SCRIPTED = [
    ("agent", "Hi {name}, quick courtesy call about your insurance renewal — is now okay?"),
    ("callee", "Sure, go ahead."),
    ("agent", "Your policy is up for renewal soon. Would you like to continue with us?"),
    ("callee", "Yes, let's keep it going."),
    ("agent", "Great — I've noted that. Thank you and have a good day!"),
]


class Command(BaseCommand):
    help = "Publish a simulated live run to the campaign's Redis channel"

    def add_arguments(self, parser):
        parser.add_argument("campaign_id", type=int)
        parser.add_argument("--delay", type=float, default=1.2, help="seconds between turns")
        parser.add_argument("--reset", action="store_true", help="reset contacts to pending first")

    def handle(self, *args, **opts):
        cid = opts["campaign_id"]
        try:
            campaign = Campaign.objects.get(id=cid)
        except Campaign.DoesNotExist:
            raise CommandError(f"campaign {cid} not found")

        if opts["reset"]:
            campaign.contacts.update(status="pending", attempts=0, last_outcome="", result={})

        r = redis.from_url(os.environ["REDIS_URL"])
        chan = f"campaign:{cid}"
        delay = opts["delay"]

        def pub(frame):
            r.publish(chan, json.dumps(frame))

        contacts = list(campaign.contacts.filter(status="pending").order_by("id"))
        if not contacts:
            self.stdout.write("no pending contacts (use --reset to replay)")
            return

        self.stdout.write(f"simulating {len(contacts)} contacts on {chan} …")
        for idx, c in enumerate(contacts):
            cid_str = str(c.id)
            # ringing
            c.status, c.attempts = "calling", 1
            c.save(update_fields=["status", "attempts"])
            pub({"type": "contact_status", "contactId": cid_str,
                 "status": "calling", "attempts": 1, "last_outcome": None})
            time.sleep(delay)

            # transcript
            turns = []
            for i, (role, text) in enumerate(SCRIPTED):
                msg = text.replace("{name}", c.name.split()[0])
                pub({"type": "transcript", "contactId": cid_str, "role": role, "text": msg})
                turns.append({"role": role, "text": msg, "time_in_call_secs": i * 4})
                time.sleep(delay)

            # every 3rd contact "doesn't answer" to show variety
            answered = (idx % 3 != 2)
            outcome = "answered" if answered else "no_answer"
            result = {"wants_renewal": True, "callback_needed": False} if answered else {}
            status = "completed" if answered else "exhausted"

            CallAttempt.objects.create(
                contact=c, attempt_no=1, conversation_id=f"sim_{c.id}",
                outcome=outcome, transcript=turns if answered else [],
                started_at=timezone.now(), ended_at=timezone.now())
            c.status, c.last_outcome, c.result = status, outcome, result
            c.save(update_fields=["status", "last_outcome", "result"])

            if result:
                pub({"type": "result", "contactId": cid_str, "result": result})
            pub({"type": "contact_status", "contactId": cid_str, "status": status,
                 "attempts": 1, "last_outcome": outcome})
            time.sleep(delay)

        # finish
        campaign.status = "completed"
        campaign.finished_at = timezone.now()
        campaign.save(update_fields=["status", "finished_at"])
        pub({"type": "campaign_status", "status": "completed"})
        self.stdout.write(self.style.SUCCESS("simulation complete"))
