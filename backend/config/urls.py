"""URL routing.

Slice 1 exposes only a health check so the stack is verifiable end-to-end.
The DRF campaign API (Slice 4) and the bare monitor page (Slice 3) are added
to their own includes when those slices land.
"""
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "rufen-campaign"})


urlpatterns = [
    path("health/", health, name="health"),
    path("api/", include("campaigns.api")),
]
