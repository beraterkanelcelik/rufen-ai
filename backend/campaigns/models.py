"""Data model — mirrors docs/00-DESIGN.md §4.

Status taxonomies are deliberately small. JSON columns carry the AI-generated
extraction schema, the per-contact extracted result, and per-attempt transcript.
"""
from django.db import models


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft"
        RUNNING = "running"
        PAUSED = "paused"
        COMPLETED = "completed"
        CANCELLED = "cancelled"

    name = models.CharField(max_length=255)
    goal = models.TextField(blank=True)
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )

    # Script (AI-generated, user-editable).
    script_prompt = models.TextField(blank=True)
    first_message = models.TextField(blank=True)
    extraction_schema = models.JSONField(default=list)  # [{key,type,desc}]
    voice_id = models.CharField(max_length=64, blank=True)
    language = models.CharField(max_length=8, default="en")

    # Run settings.
    concurrency = models.PositiveIntegerField(default=2)
    retry_delay_minutes = models.PositiveIntegerField(default=60)
    max_attempts = models.PositiveIntegerField(default=3)
    retry_on = models.JSONField(default=list)  # default set in save(); see below

    eleven_agent_id = models.CharField(max_length=128, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.retry_on:
            self.retry_on = ["no_answer", "busy", "failed"]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Campaign #{self.pk} {self.name!r} ({self.status})"


class CampaignContact(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        CALLING = "calling"
        RETRY_WAIT = "retry_wait"
        COMPLETED = "completed"
        FAILED = "failed"
        EXHAUSTED = "exhausted"

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="contacts"
    )
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32)  # E.164
    context = models.TextField(blank=True)
    language = models.CharField(max_length=8, default="en")

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    attempts = models.PositiveIntegerField(default=0)
    last_outcome = models.CharField(max_length=32, blank=True)
    result = models.JSONField(default=dict)  # extracted fields

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Contact #{self.pk} {self.name!r} <{self.phone}>"


class CallAttempt(models.Model):
    class Outcome(models.TextChoices):
        ANSWERED = "answered"
        NO_ANSWER = "no_answer"
        BUSY = "busy"
        FAILED = "failed"
        VOICEMAIL = "voicemail"
        DECLINED = "declined"
        WRONG_NUMBER = "wrong_number"

    contact = models.ForeignKey(
        CampaignContact, on_delete=models.CASCADE, related_name="call_attempts"
    )
    attempt_no = models.PositiveIntegerField()
    conversation_id = models.CharField(max_length=128, blank=True)
    outcome = models.CharField(max_length=32, choices=Outcome.choices, blank=True)
    transcript = models.JSONField(default=list)  # [{role, text, ts}]

    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["attempt_no"]

    def __str__(self):
        return f"Attempt #{self.attempt_no} of contact {self.contact_id} → {self.outcome}"
