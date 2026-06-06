import io

from campaigns.importer import normalize_phone, parse_contacts


def test_valid_de():
    assert normalize_phone("0151 23456789", "DE") == "+4915123456789"


def test_already_e164():
    assert normalize_phone("+4915123456789", "DE") == "+4915123456789"


def test_invalid():
    assert normalize_phone("not-a-number", "DE") is None


def test_parse_contacts_csv_splits_valid_invalid():
    csv_text = (
        "name,phone,context,language\n"
        "Berat,0151 23456789,BMW X5 recall,en\n"
        ",+4915199999999,no name row,en\n"
        "Bad Phone,not-a-number,bad,en\n"
    )
    valid, invalid = parse_contacts(io.StringIO(csv_text), "contacts.csv")
    assert len(valid) == 1
    assert valid[0]["name"] == "Berat"
    assert valid[0]["phone"] == "+4915123456789"
    assert valid[0]["language"] == "en"
    assert len(invalid) == 2


def test_parse_contacts_defaults_language_en():
    csv_text = "name,phone,context,language\nAna,+4915123456789,ctx,\n"
    valid, _ = parse_contacts(io.StringIO(csv_text), "contacts.csv")
    assert valid[0]["language"] == "en"
