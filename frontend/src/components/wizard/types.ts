// Wizard-local types — the in-progress draft the user is assembling.
import type {
  CallOutcome,
  ExtractionField,
  Language,
} from "../../types";

export type CampaignType =
  | "recall"
  | "warranty"
  | "service"
  | "reactivation"
  | "custom";

export type Urgency = "Immediate" | "High" | "Medium" | "Low";

/** A row parsed from the uploaded contacts file. */
export interface DraftContact {
  name: string;
  phone: string;
  context: string;
  language: Language;
  valid: boolean;
  /** Reason a row failed validation (shown in preview). */
  error?: string;
}

/** Everything the wizard collects across its 6 steps. */
export interface WizardDraft {
  // Step 1 — contacts
  contacts: DraftContact[];
  fileName: string | null;

  // Step 2 — car-dealership campaign context builder.
  // The structured fields below are composed into `goal` + `reason` (derived),
  // which feed the AI script generator and the call pipeline.
  name: string;
  goal: string; // derived from campaignType + primaryGoal
  reason: string; // derived: rich context the agent relies on
  campaignType: CampaignType;
  brand: string;
  dealershipLocation: string;
  responsibleEmployee: string;
  actionId: string; // recall / action reference
  urgency: Urgency;
  affectedModels: string;
  affectedPart: string;
  actionReason: string; // plain-language explanation for the customer
  durationMinutes: number;
  customerCost: string;
  deadline: string;
  primaryGoal: string;
  offerLoaner: boolean;
  offerPickup: boolean;
  internalNotes: string;

  // Step 3 — script (AI)
  generated: boolean;
  script_prompt: string;
  first_message: string;
  extraction_schema: ExtractionField[];

  // Step 4 — voice & language
  voice_id: string;
  voice_name?: string; // friendly name of the picked voice (for review)
  language: Language;

  // Step 5 — run settings
  concurrency: number;
  retry_delay_minutes: number;
  max_attempts: number;
  retry_on: CallOutcome[];
  send_sms: boolean;
}

export interface StepProps {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
}
