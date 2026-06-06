from django.urls import re_path
from .consumers import CallStreamConsumer

websocket_urlpatterns = [
    re_path(r"ws/call/(?P<job_id>[^/]+)/$", CallStreamConsumer.as_asgi()),
]
