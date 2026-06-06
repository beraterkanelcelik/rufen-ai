"""Delete throwaway ElevenLabs agents created during testing.

  docker compose exec web python manage.py cleanup_agents            # dry-run
  docker compose exec web python manage.py cleanup_agents --yes      # actually delete

Targets only OUR agents (name starts with "Rufen" or "diag") and PROTECTS any
agent referenced by a running/paused campaign.
"""
from django.core.management.base import BaseCommand

from campaigns.eleven import delete_agent, list_agents
from campaigns.models import Campaign

PREFIXES = ("Rufen", "diag")


class Command(BaseCommand):
    help = "Delete throwaway ElevenLabs test agents (dry-run by default)"

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="actually delete (default: dry-run)")

    def handle(self, *args, **opts):
        # agents still in use by active campaigns must NOT be deleted
        protected = set()
        for camp in Campaign.objects.filter(status__in=["running", "paused"]):
            protected.update(camp.eleven_agent_ids or [])
            if camp.eleven_agent_id:
                protected.add(camp.eleven_agent_id)

        agents = list_agents()
        targets = [
            a for a in agents
            if (a.get("name") or "").startswith(PREFIXES)
            and a.get("agent_id") not in protected
        ]

        self.stdout.write(
            f"{len(agents)} agents total · {len(targets)} throwaway · "
            f"{len(protected)} protected (active campaigns)"
        )
        if not targets:
            self.stdout.write("nothing to clean.")
            return

        if not opts["yes"]:
            for a in targets[:40]:
                self.stdout.write(f"  would delete {a.get('agent_id')}  {a.get('name')}")
            self.stdout.write(self.style.WARNING(
                f"DRY-RUN — pass --yes to delete {len(targets)} agents."))
            return

        deleted, failed = 0, 0
        for a in targets:
            try:
                delete_agent(a["agent_id"])
                deleted += 1
            except Exception as exc:
                failed += 1
                self.stdout.write(self.style.ERROR(f"  failed {a.get('agent_id')}: {exc}"))
        self.stdout.write(self.style.SUCCESS(f"deleted {deleted}, failed {failed}"))
