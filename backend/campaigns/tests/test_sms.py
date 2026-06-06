from campaigns.sms import looks_booked


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
