// Wizard-local types — the in-progress draft the user is assembling.
import type {
  CallOutcome,
  ExtractionField,
  Language,
} from "../../types";

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

  // Step 2 — goal & reason
  name: string;
  goal: string;
  reason: string;

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
}

export interface StepProps {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
}
