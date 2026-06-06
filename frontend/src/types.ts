// Core domain types for Rufen Campaign frontend.
// Mirrors docs/00-DESIGN.md section 4.

export type CampaignStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export type ContactStatus =
  | "pending"
  | "calling"
  | "retry_wait"
  | "completed"
  | "failed"
  | "exhausted";

export type CallOutcome = "answered" | "no_answer" | "busy" | "failed";

export type Language = "en" | "de";

/** A single typed field the AI should extract from each call. */
export interface ExtractionField {
  key: string;
  type: "string" | "boolean" | "number" | "date";
  desc: string;
}

export interface Campaign {
  id: string;
  name: string;
  goal: string;
  reason: string;
  status: CampaignStatus;

  // script (AI-generated, user-editable)
  script_prompt: string;
  first_message: string;
  extraction_schema: ExtractionField[];
  voice_id: string;
  language: Language;

  // run settings
  concurrency: number;
  retry_delay_minutes: number;
  max_attempts: number;
  retry_on: CallOutcome[];

  eleven_agent_id: string | null;

  created_at: string;
  started_at: string | null;
  finished_at: string | null;

  // convenience aggregates from the backend
  contact_count: number;
  done_count?: number; // contacts in a terminal state (completed/failed/exhausted)
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  name: string;
  phone: string; // E.164
  context: string;
  language: Language;

  status: ContactStatus;
  attempts: number;
  last_outcome: CallOutcome | null;
  result: Record<string, unknown> | null; // extracted fields
  transcript?: TranscriptTurn[]; // latest attempt's saved transcript

  created_at: string;
}

export interface TranscriptTurn {
  role: "agent" | "callee";
  text: string;
  ts: string;
}

export interface CallAttempt {
  id: string;
  contact_id: string;
  attempt_no: number;
  conversation_id: string;
  outcome: CallOutcome | null;
  transcript: TranscriptTurn[];
  started_at: string;
  ended_at: string | null;
}

// ── Live monitor event shapes (subscribeLive) ───────────────────────────────

/** Per-contact status change. */
export interface ContactStatusEvent {
  type: "contact_status";
  contactId: string;
  status: ContactStatus;
  attempts: number;
  last_outcome: CallOutcome | null;
}

/** A single transcript turn streamed during a live call. */
export interface TranscriptEvent {
  type: "transcript";
  contactId: string;
  role: "agent" | "callee";
  text: string;
}

/** Countdown (seconds remaining) while a contact waits to be retried. */
export interface RetryCountdownEvent {
  type: "retry_countdown";
  contactId: string;
  secondsRemaining: number;
}

/** Final extracted structured result for a contact, written on completion. */
export interface ResultEvent {
  type: "result";
  contactId: string;
  result: Record<string, unknown>;
}

/** Rolling aggregate counters for the whole campaign. */
export interface AggregateEvent {
  type: "aggregate";
  pending: number;
  calling: number;
  retry_wait: number;
  completed: number;
  failed: number;
  exhausted: number;
  total: number;
  successRate: number; // 0..1
}

/** Campaign-level lifecycle change (e.g. fully done). */
export interface CampaignStatusEvent {
  type: "campaign_status";
  status: CampaignStatus;
}

export type LiveEvent =
  | ContactStatusEvent
  | TranscriptEvent
  | RetryCountdownEvent
  | ResultEvent
  | AggregateEvent
  | CampaignStatusEvent;
