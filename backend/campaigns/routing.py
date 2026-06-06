"""WebSocket routes for the live campaign monitor."""
from django.urls import re_path

from .consumers import CampaignMonitorConsumer

websocket_urlpatterns = [
    re_path(r"ws/campaign/(?P<campaign_id>\d+)/$", CampaignMonitorConsumer.as_asgi()),
]
