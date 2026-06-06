"""REST API for campaigns + contacts. Mounted under /api/ (see config/urls.py).

Auth is mocked (hackathon): endpoints are AllowAny. The launch endpoint marks a
campaign running and, when telephony is configured (ELEVEN_AGENT_PHONE_NUMBER_ID
+ an agent), starts a Temporal workflow per contact — otherwise it just flips
status so the monitor can stream simulated runs.
"""
import io
import os

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.urls import path
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .eleven import list_voices
from .generator import generate_script
from .importer import parse_contacts
from .models import Campaign
from .serializers import (
    CampaignCreateSerializer,
    CampaignSerializer,
    ContactSerializer,
)


@api_view(["GET", "POST"])
def campaigns_collection(request):
    if request.method == "POST":
        ser = CampaignCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        campaign = ser.save()
        return Response(CampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)

    qs = Campaign.objects.all().order_by("-created_at")
    return Response(CampaignSerializer(qs, many=True).data)


@api_view(["GET", "PATCH"])
def campaign_detail(request, pk):
    campaign = get_object_or_404(Campaign, pk=pk)
    if request.method == "PATCH":
        # NOTE: auth is mocked for this hackathon (locked decision) — no users/
        # tenancy to scope against. `status` is intentionally NOT editable here:
        # lifecycle transitions go through dedicated endpoints (launch/…).
        editable = {
            "name", "goal", "reason", "script_prompt", "first_message",
            "extraction_schema", "voice_id", "language", "concurrency",
            "retry_delay_minutes", "max_attempts", "retry_on",
        }
        for k, v in request.data.items():
            if k in editable:
                setattr(campaign, k, v)
        try:
            campaign.full_clean()  # enforce model field types / choice constraints
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
        campaign.save()
    return Response(CampaignSerializer(campaign).data)


@api_view(["GET"])
def campaign_contacts(request, pk):
    campaign = get_object_or_404(Campaign, pk=pk)
    qs = campaign.contacts.all().order_by("id")
    return Response(ContactSerializer(qs, many=True).data)


@api_view(["POST"])
def campaign_launch(request, pk):
    campaign = get_object_or_404(Campaign, pk=pk)
    campaign.status = "running"
    campaign.started_at = timezone.now()
    campaign.save()

    telephony_ready = bool(
        os.environ.get("ELEVEN_AGENT_PHONE_NUMBER_ID") and campaign.eleven_agent_id
    )
    # Real workflow start is wired with CampaignWorkflow (Slice 3); until the SIP
    # number is imported we just flip status so the monitor can run simulations.
    return Response({
        **CampaignSerializer(campaign).data,
        "telephony_ready": telephony_ready,
    })


@api_view(["POST"])
def generate(request):
    """AI-draft the call script from goal/reason + available fields (Slice 4)."""
    goal = (request.data.get("goal") or "").strip()
    reason = (request.data.get("reason") or "").strip()
    fields = request.data.get("fields") or ["name", "context"]
    if not goal:
        return Response({"detail": "goal is required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        data = generate_script(goal, reason, tuple(fields))
    except Exception as exc:  # surface LLM/provider errors as 502
        return Response({"detail": f"generation failed: {exc}"},
                        status=status.HTTP_502_BAD_GATEWAY)
    return Response(data)


@api_view(["GET"])
def voices(request):
    """Real ElevenLabs voices for the wizard picker."""
    try:
        return Response(list_voices())
    except Exception as exc:
        return Response({"detail": f"could not list voices: {exc}"},
                        status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
def contacts_parse(request):
    """Parse an uploaded .csv/.xlsx into valid/invalid contact rows (no DB write)."""
    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "no file uploaded (field 'file')"},
                        status=status.HTTP_400_BAD_REQUEST)
    raw = f.read()
    if f.name.lower().endswith(".csv"):
        fileobj = io.StringIO(raw.decode("utf-8-sig", errors="replace"))
    else:
        fileobj = io.BytesIO(raw)
    valid, invalid = parse_contacts(fileobj, f.name)
    rows = [{**v, "valid": True} for v in valid] + [
        {"name": (i.get("name") or ""), "phone": (i.get("phone") or ""),
         "context": (i.get("context") or ""), "language": (i.get("language") or "en"),
         "valid": False, "error": i.get("_error") or "invalid row"}
        for i in invalid
    ]
    return Response({"fileName": f.name, "contacts": rows,
                     "valid": len(valid), "invalid": len(invalid)})


urlpatterns = [
    path("campaigns", campaigns_collection),
    path("campaigns/<int:pk>", campaign_detail),
    path("campaigns/<int:pk>/contacts", campaign_contacts),
    path("campaigns/<int:pk>/launch", campaign_launch),
    path("generate", generate),
    path("voices", voices),
    path("contacts/parse", contacts_parse),
]
