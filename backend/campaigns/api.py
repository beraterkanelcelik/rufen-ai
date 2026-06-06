"""REST API for campaigns + contacts. Mounted under /api/ (see config/urls.py).

Auth is mocked (hackathon): endpoints are AllowAny. The launch endpoint marks a
campaign running and, when telephony is configured (ELEVEN_AGENT_PHONE_NUMBER_ID
+ an agent), starts a Temporal workflow per contact — otherwise it just flips
status so the monitor can stream simulated runs.
"""
import os

from django.shortcuts import get_object_or_404
from django.urls import path
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

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
        editable = {
            "name", "goal", "reason", "script_prompt", "first_message",
            "extraction_schema", "voice_id", "language", "concurrency",
            "retry_delay_minutes", "max_attempts", "retry_on", "status",
        }
        for k, v in request.data.items():
            if k in editable:
                setattr(campaign, k, v)
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


urlpatterns = [
    path("campaigns", campaigns_collection),
    path("campaigns/<int:pk>", campaign_detail),
    path("campaigns/<int:pk>/contacts", campaign_contacts),
    path("campaigns/<int:pk>/launch", campaign_launch),
]
