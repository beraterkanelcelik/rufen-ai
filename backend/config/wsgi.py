"""WSGI entrypoint (kept for tooling; production/dev runs ASGI via Daphne)."""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
