from django.urls import path
from django.views.generic import TemplateView
from calls import views

urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html")),
    path("api/test-call", views.test_call),
]
