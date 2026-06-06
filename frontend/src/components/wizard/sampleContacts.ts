import type { DraftContact } from "./types";

/**
 * Mock parse result for the "uploaded" BMW contacts file.
 * Mirrors the BMW seed list + a couple of intentionally-invalid rows so the
 * preview can show valid/invalid counts (DESIGN.md §5: reject missing
 * name/phone, flag non-E.164 numbers).
 */
export const SAMPLE_FILE_NAME = "bmw_recall_23V-456_owners.csv";

export const SAMPLE_CONTACTS: DraftContact[] = [
  {
    name: "Berat",
    phone: "+4915112345678",
    context: "2021 BMW 330i — VIN ...4821, recall 23V-456",
    language: "en",
    valid: true,
  },
  {
    name: "Teammate",
    phone: "+4915187654321",
    context: "2020 BMW X3 — VIN ...9913, recall 23V-456",
    language: "en",
    valid: true,
  },
  {
    name: "Anna Müller",
    phone: "+4917622233344",
    context: "2019 BMW 520d — VIN ...1077",
    language: "de",
    valid: true,
  },
  {
    name: "Lukas Schmidt",
    phone: "+4916099988877",
    context: "2022 BMW M340i — VIN ...3320",
    language: "de",
    valid: true,
  },
  {
    name: "Sofia Rossi",
    phone: "+4915255544433",
    context: "2018 BMW 118i — VIN ...6654",
    language: "en",
    valid: true,
  },
  {
    name: "James Carter",
    phone: "+4917011122233",
    context: "2021 BMW iX3 — VIN ...8890",
    language: "en",
    valid: true,
  },
  {
    name: "Markus Brandt",
    phone: "+4915344455566",
    context: "2020 BMW 218d — VIN ...2244",
    language: "de",
    valid: true,
  },
  {
    name: "Elena Petrova",
    phone: "+4917899900011",
    context: "2019 BMW Z4 — VIN ...5567",
    language: "en",
    valid: true,
  },
  // ── Intentionally invalid rows (to exercise validation UI) ──
  {
    name: "",
    phone: "+4915200011122",
    context: "2021 BMW 320i — VIN ...7781",
    language: "en",
    valid: false,
    error: "Missing name",
  },
  {
    name: "Tom Becker",
    phone: "0151-not-a-number",
    context: "2018 BMW 116i — VIN ...3398",
    language: "de",
    valid: false,
    error: "Invalid phone (not E.164)",
  },
];
