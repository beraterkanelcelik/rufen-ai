// Real backend client. Talks to the Django/Channels backend on :8000.
// WS connects STRAIGHT to :8000 (never via the Vite proxy) per the backend gotchas.
import type { Campaign, CampaignContact, LiveEvent } from "./types";

const API_BASE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ??
  "http://localhost:8000/api";
const WS_BASE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_WS_BASE ??
  "ws://localhost:8000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

export const fetchCampaigns = () => http<Campaign[]>("/campaigns");
export const fetchCampaign = (id: string) => http<Campaign>(`/campaigns/${id}`);
export const fetchContacts = (id: string) =>
  http<CampaignContact[]>(`/campaigns/${id}/contacts`);

export interface CreateCampaignBody {
  name: string;
  goal: string;
  reason: string;
  script_prompt: string;
  first_message: string;
  extraction_schema: Campaign["extraction_schema"];
  voice_id: string;
  language: Campaign["language"];
  concurrency: number;
  retry_delay_minutes: number;
  max_attempts: number;
  retry_on: Campaign["retry_on"];
  contacts: Array<{ name: string; phone: string; context: string; language: string }>;
}

export const createCampaign = (body: CreateCampaignBody) =>
  http<Campaign>("/campaigns", { method: "POST", body: JSON.stringify(body) });

export const launchCampaign = (id: string) =>
  http<Campaign>(`/campaigns/${id}/launch`, { method: "POST" });

// ── Wizard support: real AI generation, real voices, real file parsing ──────
export interface GeneratedScript {
  script_prompt: string;
  first_message: string;
  extraction_schema: Campaign["extraction_schema"];
}

export const generateScript = (goal: string, reason: string, fields: string[]) =>
  http<GeneratedScript>("/generate", {
    method: "POST",
    body: JSON.stringify({ goal, reason, fields }),
  });

export interface TestCallResult {
  conversation_id: string;
  agent_id: string;
}

export interface TestCallBody {
  phone: string;
  script_prompt: string;
  first_message: string;
  voice_id: string;
  language: string;
  extraction_schema: Campaign["extraction_schema"];
  name?: string;
  context?: string;
}

export const testCall = (body: TestCallBody) =>
  http<TestCallResult>("/test-call", { method: "POST", body: JSON.stringify(body) });

export interface TestCallStatus {
  status: string;
  transcript: { role: "agent" | "callee"; text: string }[];
  reason?: string | null;
}

export const getTestCall = (cid: string) => http<TestCallStatus>(`/test-call/${cid}`);

export interface Voice {
  id: string;
  name: string;
  accent: string;
  desc: string;
  preview_url: string | null;
}

export const fetchVoices = () => http<Voice[]>("/voices");

export interface ParsedContact {
  name: string;
  phone: string;
  context: string;
  language: "en" | "de";
  valid: boolean;
  error?: string;
}

export interface ParseResult {
  fileName: string;
  contacts: ParsedContact[];
  valid: number;
  invalid: number;
}

export async function parseContacts(file: File): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/contacts/parse`, {
    method: "POST",
    body: form, // let the browser set the multipart boundary
  });
  if (!res.ok) throw new Error(`POST /contacts/parse → ${res.status}`);
  return (await res.json()) as ParseResult;
}

/** Open the live monitor WebSocket. Same signature as the old mock so pages
 *  swap import only. Returns an unsubscribe fn. */
export function subscribeLive(
  campaignId: string,
  onEvent: (e: LiveEvent) => void,
): () => void {
  const ws = new WebSocket(`${WS_BASE}/ws/campaign/${campaignId}/?token=mock`);
  ws.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data) as LiveEvent);
    } catch {
      /* ignore malformed frame */
    }
  };
  return () => {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  };
}
