"""TDD the CSV formula-injection sanitizer + the export shape."""
import pytest

from campaigns.export import build_csv, sanitize


def test_sanitize_formula_prefixes():
    assert sanitize("=1+2") == "'=1+2"
    assert sanitize("+SUM(A1)") == "'+SUM(A1)"
    assert sanitize("-2") == "'-2"
    assert sanitize("@cmd") == "'@cmd"


def test_sanitize_plain_and_types():
    assert sanitize("Berat") == "Berat"
    assert sanitize(True) == "true"
    assert sanitize(False) == "false"
    assert sanitize(None) == ""
    assert sanitize(3) == "3"


@pytest.mark.django_db
def test_build_csv_includes_extraction_fields():
    from campaigns.models import Campaign, CampaignContact

    camp = Campaign.objects.create(
        name="Recall", extraction_schema=[{"key": "agreed", "type": "boolean", "desc": "?"}]
    )
    CampaignContact.objects.create(
        campaign=camp, name="Alice", phone="+4915112345670", context="X5",
        status="completed", attempts=1, last_outcome="answered",
        result={"agreed": True},
    )
    csv_text = build_csv(camp)
    lines = csv_text.strip().splitlines()
    assert lines[0].split(",") == ["name", "phone", "context", "status", "attempts", "last_outcome", "agreed"]
    # phone starts with '+' → sanitized to text, and the row carries the extracted value
    assert "Alice" in lines[1]
    assert "'+4915112345670" in lines[1]
    assert lines[1].endswith("true")
