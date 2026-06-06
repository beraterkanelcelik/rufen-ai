"""CSV export of campaign results, with spreadsheet formula-injection sanitization
(a cell starting with = + - @ tab or CR is prefixed with ' so Excel/Sheets treat
it as text, not a formula)."""
import csv
import io

DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize(value) -> str:
    """Stringify + neutralise formula-injection leading characters."""
    if value is None:
        return ""
    if value is True:
        return "true"
    if value is False:
        return "false"
    s = str(value)
    if s[:1] in DANGEROUS_PREFIXES:
        s = "'" + s
    return s


def build_csv(campaign) -> str:
    keys = [f.get("key") for f in (campaign.extraction_schema or []) if f.get("key")]
    headers = ["name", "phone", "context", "status", "attempts", "last_outcome", *keys]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([sanitize(h) for h in headers])
    for c in campaign.contacts.all().order_by("id"):
        result = c.result or {}
        row = [c.name, c.phone, c.context, c.status, c.attempts, c.last_outcome or ""]
        row += [result.get(k, "") for k in keys]
        writer.writerow([sanitize(v) for v in row])
    return buf.getvalue()
