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

    class Meta:
        model = CampaignContact
        fields = [
            "id", "campaign_id", "name", "phone", "context", "language",
            "status", "attempts", "last_outcome", "result", "created_at",
        ]

    def get_id(self, obj):
        return str(obj.id)

    def get_campaign_id(self, obj):
        return str(obj.campaign_id)

    def get_last_outcome(self, obj):
        return obj.last_outcome or None


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
