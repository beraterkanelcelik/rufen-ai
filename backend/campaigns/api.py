"""REST API for campaigns + contacts. Mounted under /api/ (see config/urls.py).

Auth is mocked (hackathon): endpoints are AllowAny. The launch endpoint marks a
campaign running and, when telephony is configured (ELEVEN_AGENT_PHONE_NUMBER_ID
+ an agent), starts a Temporal workflow per contact — otherwise it just flips
status so the monitor can stream simulated runs.
"""
import io
import os

from asgiref.sync import async_to_sync
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.urls import path
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from temporalio.client import Client

from .eleven import create_agent, get_conversation, list_voices, start_call
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


def _ensure_agents(campaign):
    """Create a POOL of ElevenLabs agents — one per concurrency slot, because
    ElevenLabs allows only 1 concurrent call per agent. Idempotent. Returns the
    list of agent ids."""
    if campaign.eleven_agent_ids:
        return campaign.eleven_agent_ids
    pool_size = max(1, int(campaign.concurrency or 1))
    agent_ids = []
    for i in range(pool_size):
        agent_ids.append(async_to_sync(create_agent)(
            name=f"Rufen × Cara8 #{campaign.id}/{i + 1} — {campaign.name}"[:100],
            system_prompt=campaign.script_prompt,
            first_message=campaign.first_message,
            voice_id=campaign.voice_id,
            language=campaign.language,
            data_collection=campaign.extraction_schema,
        ))
    campaign.eleven_agent_ids = agent_ids
    campaign.eleven_agent_id = agent_ids[0]
    campaign.save(update_fields=["eleven_agent_ids", "eleven_agent_id"])
    return agent_ids


def _start_campaign_workflow(campaign, contact_ids, agent_ids):
    """Connect a Temporal client and start CampaignWorkflow (id=campaign-{id})."""
    async def _run():
        client = await Client.connect(
            os.environ.get("TEMPORAL_HOST", "temporal:7233"),
            namespace=os.environ.get("TEMPORAL_NAMESPACE", "rufen"),
        )
        await client.start_workflow(
            "CampaignWorkflow",
            args=[campaign.id, contact_ids, campaign.concurrency, agent_ids,
                  campaign.retry_on, campaign.retry_delay_minutes, campaign.max_attempts],
            id=f"campaign-{campaign.id}",
            task_queue="campaigns",
        )

    async_to_sync(_run)()


@api_view(["POST"])
def campaign_launch(request, pk):
    """Create the ElevenLabs agent + start the Temporal CampaignWorkflow."""
    campaign = get_object_or_404(Campaign, pk=pk)
    contact_ids = list(campaign.contacts.values_list("id", flat=True))

    started = False
    if contact_ids:
        try:
            agent_ids = _ensure_agents(campaign)
        except Exception as exc:
            return Response({"detail": f"agent creation failed: {exc}"},
                            status=status.HTTP_502_BAD_GATEWAY)
        try:
            _start_campaign_workflow(campaign, contact_ids, agent_ids)
            started = True
        except Exception as exc:
            # idempotent: a re-launch of a running campaign is fine
            if "already" in str(exc).lower():
                started = True
            else:
                return Response({"detail": f"could not start workflow: {exc}"},
                                status=status.HTTP_502_BAD_GATEWAY)

    campaign.status = "running"
    campaign.started_at = timezone.now()
    campaign.save()

    telephony_ready = bool(os.environ.get("ELEVEN_AGENT_PHONE_NUMBER_ID"))
    return Response({
        **CampaignSerializer(campaign).data,
        "workflow_started": started,
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
def test_call(request):
    """Place a single REAL test call using the campaign's draft script + voice, so
    the user can hear exactly what customers will hear before launching."""
    d = request.data
    phone = (d.get("phone") or "").strip()
    if not phone:
        return Response({"detail": "phone is required"}, status=status.HTTP_400_BAD_REQUEST)
    if not os.environ.get("ELEVEN_AGENT_PHONE_NUMBER_ID"):
        return Response({"detail": "telephony not configured (ELEVEN_AGENT_PHONE_NUMBER_ID)"},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        agent_id = async_to_sync(create_agent)(
            name=f"Rufen × Cara8 — test {phone}"[:100],
            system_prompt=d.get("script_prompt") or "You are a friendly AI assistant making a quick test call. Confirm the person can hear you, then thank them and end.",
            first_message=d.get("first_message") or "Hi {{name}}, this is a quick test call — can you hear me okay?",
            voice_id=d.get("voice_id") or "",
            language=d.get("language") or "en",
            data_collection=d.get("extraction_schema") or [],
        )
        dyn = {"name": d.get("name") or "there",
               "context": d.get("context") or "a quick test call",
               "phone": phone}
        res = async_to_sync(start_call)(agent_id, phone, dyn)
        return Response({"conversation_id": res.get("conversation_id"), "agent_id": agent_id})
    except Exception as exc:
        return Response({"detail": f"test call failed: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
def test_call_status(request, cid):
    """Poll a test call's live status + transcript (frontend polls this ~1/s)."""
    try:
        data = async_to_sync(get_conversation)(cid)
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
    transcript = [
        {"role": "callee" if t.get("role") == "user" else "agent",
         "text": t.get("message") or ""}
        for t in (data.get("transcript") or [])
    ]
    return Response({"status": data.get("status"), "transcript": transcript})


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
    path("test-call", test_call),
    path("test-call/<str:cid>", test_call_status),
]
