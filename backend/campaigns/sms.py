"""Telnyx SMS — confirmation texts after a successful call.

Germany: geographic numbers can't send SMS, so we use an ALPHANUMERIC sender ID
(one-way) through the messaging profile. Best-effort; never raises into callers.

Env:
  TELNYX_API_KEY                (required)
  TELNYX_MESSAGING_PROFILE_ID   enables SMS when set
  TELNYX_SMS_SENDER             alphanumeric sender, default "RufenCara8" (<=11 chars)
"""
import os

import httpx


def sms_enabled() -> bool:
    return bool(os.environ.get("TELNYX_API_KEY") and os.environ.get("TELNYX_MESSAGING_PROFILE_ID"))


def send_sms(to: str, text: str) -> bool:
    if not sms_enabled():
        return False
    body = {
        "from": os.environ.get("TELNYX_SMS_SENDER", "RufenCara8"),
        "to": to,
        "text": text,
        "messaging_profile_id": os.environ["TELNYX_MESSAGING_PROFILE_ID"],
    }
    with httpx.Client(timeout=30) as c:
        r = c.post(
            "https://api.telnyx.com/v2/messages",
            headers={"Authorization": f"Bearer {os.environ['TELNYX_API_KEY']}",
                     "Content-Type": "application/json"},
            json=body,
        )
        r.raise_for_status()
        return True


# common AI-generated result keys for an appointment date/time
_DATE_KEYS = ("preferred_appointment_date", "preferred_date", "appointment_date", "preferred_day")
_TIME_KEYS = ("preferred_appointment_time", "preferred_time", "appointment_time")

_BOOK_HINTS = ("book", "agree", "renew", "schedul")  # not "confirm" (matches owner_confirmation)


def _truthy(v) -> bool:
    if v is True:
        return True
    return isinstance(v, str) and v.strip().lower() in ("true", "yes", "ja", "y", "1", "confirmed")


def looks_booked(result) -> bool:
    """Only confirm when the call actually produced a booking — an appointment
    date/time was captured, or a booking/agree/renew field is affirmative.
    Avoids texting "appointment confirmed" to people who declined."""
    r = result or {}
    if any(r.get(k) for k in _DATE_KEYS) or any(r.get(k) for k in _TIME_KEYS):
        return True
    for k, v in r.items():
        if any(h in k.lower() for h in _BOOK_HINTS) and _truthy(v):
            return True
    return False


def compose_confirmation(contact, campaign) -> str:
    name = (contact.name or "there").split()[0]
    result = contact.result or {}
    date = next((str(result[k]) for k in _DATE_KEYS if result.get(k)), None)
    time = next((str(result[k]) for k in _TIME_KEYS if result.get(k)), None)
    msg = f"Hi {name}, your service appointment for \"{campaign.name}\" is confirmed."
    if date:
        msg += f" {date}{(' at ' + time) if time else ''}."
    msg += " — Reply not monitored."
    return msg
