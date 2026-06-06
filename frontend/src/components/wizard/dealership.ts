// Car-dealership campaign context builder.
// Turns the structured wizard answers into a concise `goal` and a rich `reason`
// that our backend AI generator (/api/generate) uses to draft the call script.
import type { CampaignType, Urgency, WizardDraft } from "./types";

export const CAMPAIGN_TYPES: { id: CampaignType; title: string; sub: string }[] = [
  { id: "recall", title: "Recall", sub: "Safety action" },
  { id: "warranty", title: "Warranty", sub: "Goodwill swap" },
  { id: "service", title: "Service", sub: "Standard check" },
  { id: "reactivation", title: "Reactivation", sub: "Inactive owners" },
  { id: "custom", title: "Custom", sub: "Own content" },
];

export const BRANDS = [
  "BMW / Mini",
  "Volkswagen / ŠKODA",
  "Audi / Cupra",
  "Mercedes-Benz",
  "Other",
];

export const URGENCIES: Urgency[] = ["Immediate", "High", "Medium", "Low"];

export const PRIMARY_GOALS = [
  "Book a free service appointment",
  "Confirm the recall (note interest only)",
  "Re-engage the customer",
];

const TYPE_LABEL: Record<CampaignType, string> = {
  recall: "manufacturer recall",
  warranty: "warranty / goodwill action",
  service: "service campaign",
  reactivation: "customer reactivation campaign",
  custom: "campaign",
};

export function composeGoal(d: WizardDraft): string {
  return d.primaryGoal || "Book a free service appointment";
}

export function composeReason(d: WizardDraft): string {
  const p: string[] = [];
  p.push(
    `${d.brand} ${TYPE_LABEL[d.campaignType]}${d.actionId ? ` (${d.actionId})` : ""}.`
  );
  if (d.affectedModels) p.push(`Affected vehicles: ${d.affectedModels}.`);
  if (d.affectedPart) p.push(`Component / focus: ${d.affectedPart}.`);
  if (d.actionReason) p.push(d.actionReason);
  const cost = d.customerCost?.trim() || "free of charge";
  p.push(`The service is ${cost} and takes about ${d.durationMinutes} minutes.`);
  if (d.urgency) {
    p.push(`Urgency: ${d.urgency}${d.deadline ? `; ideally completed by ${d.deadline}` : ""}.`);
  }
  if (d.dealershipLocation) {
    p.push(
      `You are calling on behalf of ${d.dealershipLocation}` +
        (d.responsibleEmployee ? ` (service contact: ${d.responsibleEmployee}).` : ".")
    );
  }
  // edge-case handling guidance baked into the agent's context
  p.push(
    "If the person is not the vehicle owner, politely ask for the current owner. " +
      "If they ask to speak to a human, offer to transfer to the service desk. " +
      "If now is a bad time, capture a preferred callback time."
  );
  if (d.offerLoaner) p.push("A replacement / loaner car can be offered during the service.");
  if (d.offerPickup) p.push("A pick-up and delivery service is available.");
  return p.join(" ");
}
