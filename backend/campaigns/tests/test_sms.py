from types import SimpleNamespace

from campaigns.sms import compose_confirmation, find_plate, looks_booked


def _contact(**kw):
    # synthetic fixture data only — no real names/numbers (public repo)
    base = dict(name="Test Customer", phone="+490000000000", context="", result={})
    base.update(kw)
    # find_plate reads contact.call_attempts only via the model; not used here
    return SimpleNamespace(**base)


def _campaign(**kw):
    base = dict(name="BMW Airbag Recall 23V-456", dealership_name="BMW Zentrum Hamburg-Altona")
    base.update(kw)
    return SimpleNamespace(**base)


def test_decline_is_not_booked():
    # customer said "no, bye-bye" — all extracted fields null
    assert looks_booked({"owner_confirmation": None, "preferred_appointment_date": None}) is False


def test_empty_is_not_booked():
    assert looks_booked({}) is False
    assert looks_booked(None) is False


def test_appointment_date_is_booked():
    assert looks_booked({"preferred_appointment_date": "next Tuesday"}) is True


def test_appointment_time_is_booked():
    assert looks_booked({"preferred_appointment_time": "10am"}) is True


def test_agreed_yes_is_booked():
    assert looks_booked({"agreed_to_book": "yes"}) is True


def test_booking_true_is_booked():
    assert looks_booked({"booking_made": True}) is True


def test_owner_confirmation_alone_is_not_booked():
    # "confirm" must NOT count — owner_confirmation=yes just means we reached the
    # right person, not that they booked anything.
    assert looks_booked({"owner_confirmation": "yes"}) is False


def test_declined_field_false_is_not_booked():
    assert looks_booked({"agreed_to_renew": "no"}) is False


# ── find_plate ──────────────────────────────────────────────────────────────
def test_plate_from_result_key():
    c = _contact(result={"license_plate": "HH-AB 1234"})
    assert find_plate(c) == "HH-AB 1234"


def test_plate_from_context_regex():
    c = _contact(context="BMW X5 2020, plate HH-AB 1234, VIN WBA...")
    assert find_plate(c) == "HH-AB 1234"


def test_plate_none_when_absent():
    c = _contact(context="just a BMW X5, no plate here")
    assert find_plate(c) is None


# ── compose_confirmation ────────────────────────────────────────────────────
def test_confirmation_has_warm_goodbye_and_dealership_tag():
    msg = compose_confirmation(_contact(), _campaign())
    assert "safe drives" in msg
    assert msg.rstrip().splitlines()[0]  # has a body
    assert "— BMW Zentrum Hamburg-Altona" in msg


def test_confirmation_includes_plate_and_date():
    c = _contact(
        result={"license_plate": "HH-AB 1234", "preferred_appointment_date": "next Tuesday"}
    )
    msg = compose_confirmation(c, _campaign())
    assert "HH-AB 1234" in msg
    assert "next Tuesday" in msg


def test_confirmation_without_dealership_has_no_tag_line():
    msg = compose_confirmation(_contact(), _campaign(dealership_name=""))
    assert "—" not in msg.split("safe drives")[1].split("Automated")[0]
