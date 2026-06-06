import type { Campaign, CampaignContact } from "../../types";

/**
 * Strip spreadsheet formula-injection prefixes from a cell value
 * (Rufen lesson: sanitize CSV exports). Prefix dangerous leading chars
 * with a single quote so Excel/Sheets treats them as text.
 */
function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // CSV-escape: wrap in quotes if it contains comma, quote, or newline.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Build a CSV string from the current contacts + their extracted results.
 * Columns: name, phone, status, attempts, last_outcome, then one column per
 * extraction-schema field.
 */
export function buildCsv(
  campaign: Campaign,
  contacts: CampaignContact[]
): string {
  const resultKeys = campaign.extraction_schema.map((f) => f.key);
  const headers = [
    "name",
    "phone",
    "context",
    "status",
    "attempts",
    "last_outcome",
    ...resultKeys,
  ];

  const rows = contacts.map((c) => {
    const base = [
      c.name,
      c.phone,
      c.context,
      c.status,
      c.attempts,
      c.last_outcome ?? "",
    ];
    const results = resultKeys.map((k) => c.result?.[k] ?? "");
    return [...base, ...results].map(sanitizeCell).join(",");
  });

  return [headers.map(sanitizeCell).join(","), ...rows].join("\r\n");
}

/** Trigger a client-side download of the campaign results as a .csv file. */
export function downloadCsv(campaign: Campaign, contacts: CampaignContact[]) {
  const csv = buildCsv(campaign, contacts);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const safeName = campaign.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName || "campaign"}_results.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
