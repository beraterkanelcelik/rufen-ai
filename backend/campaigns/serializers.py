"""DRF serializers — JSON shapes mirror the frontend's TypeScript types exactly
(ids are strings; last_outcome is null not ''; campaigns carry contact_count +
done_count convenience aggregates)."""
from rest_framework import serializers

from .models import Campaign, CampaignContact

TERMINAL = ("completed", "failed", "exhausted")


class ContactSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    campaign_id = serializers.SerializerMethodField()
    last_outcome = serializers.SerializerMethodField()
    transcript = serializers.SerializerMethodField()

    class Meta:
        model = CampaignContact
        fields = [
            "id", "campaign_id", "name", "phone", "context", "language",
            "status", "attempts", "last_outcome", "result", "transcript", "created_at",
        ]

    def get_id(self, obj):
        return str(obj.id)

    def get_campaign_id(self, obj):
        return str(obj.campaign_id)

    def get_last_outcome(self, obj):
        return obj.last_outcome or None

    def get_transcript(self, obj):
        """Latest attempt's transcript, mapped to the frontend's turn shape so the
        monitor shows it after the call (not only from live WS frames)."""
        att = obj.call_attempts.order_by("-attempt_no").first()
        if not att or not att.transcript:
            return []
        turns = []
        for i, t in enumerate(att.transcript):
            raw = (t.get("role") or "").lower()
            role = "callee" if raw in ("user", "callee") else "agent"
            secs = t.get("time_in_call_secs")
            turns.append({
                "role": role,
                "text": t.get("text") or t.get("message") or "",
                "ts": str(secs if secs is not None else i),
            })
        return turns


class CampaignSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    contact_count = serializers.SerializerMethodField()
    done_count = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            "id", "name", "goal", "reason", "status",
            "script_prompt", "first_message", "extraction_schema",
            "voice_id", "language",
            "concurrency", "retry_delay_minutes", "max_attempts", "retry_on",
            "eleven_agent_id", "created_at", "started_at", "finished_at",
            "contact_count", "done_count",
        ]

    def get_id(self, obj):
        return str(obj.id)

    def get_contact_count(self, obj):
        return getattr(obj, "contact_count", None) or obj.contacts.count()

    def get_done_count(self, obj):
        return obj.contacts.filter(status__in=TERMINAL).count()


class CampaignCreateSerializer(serializers.ModelSerializer):
    """Accepts the wizard draft (campaign fields + an inline contacts list)."""
    contacts = serializers.ListField(child=serializers.DictField(), required=False, default=list)

    class Meta:
        model = Campaign
        fields = [
            "name", "goal", "reason",
            "script_prompt", "first_message", "extraction_schema",
            "voice_id", "language",
            "concurrency", "retry_delay_minutes", "max_attempts", "retry_on",
            "contacts",
        ]

    def create(self, validated):
        contacts = validated.pop("contacts", [])
        if "concurrency" in validated:  # cap at min(ElevenLabs, Telnyx) = 2
            validated["concurrency"] = max(1, min(2, int(validated["concurrency"] or 1)))
        campaign = Campaign.objects.create(**validated)
        for c in contacts:
            CampaignContact.objects.create(
                campaign=campaign,
                name=(c.get("name") or "").strip(),
                phone=(c.get("phone") or "").strip(),
                context=(c.get("context") or "").strip(),
                language=(c.get("language") or campaign.language or "en"),
            )
        return campaign
