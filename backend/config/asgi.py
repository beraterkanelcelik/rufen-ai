"""ASGI entrypoint — HTTP (Django) + WebSocket (Channels).

WebSocket routes live in ``campaigns.routing.websocket_urlpatterns`` (the live
monitor consumer is wired in Slice 3; the list is empty until then so this boots
cleanly today).
"""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application

# Initialise Django apps before importing anything that touches the app registry.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter

from campaigns.routing import websocket_urlpatterns

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(websocket_urlpatterns),
    }
)
