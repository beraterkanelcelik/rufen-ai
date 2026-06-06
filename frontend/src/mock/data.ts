import type {
  Campaign,
  CampaignContact,
  CallOutcome,
  ContactStatus,
  LiveEvent,
} from "../types";

// ── Static seed data ────────────────────────────────────────────────────────

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const CAMPAIGNS: Campaign[] = [
  {
    id: "cmp_bmw_airbag",
    name: "BMW Airbag Recall 23V-456",
    goal: "Get owners to book a recall service appointment at their local dealer.",
    reason:
      "Mandatory airbag inflator recall (23V-456). Affected VINs must be serviced within 30 days.",
    status: "running",
    script_prompt:
      "You are an AI assistant calling on behalf of BMW Service. Politely inform {name} that their vehicle ({context}) is affected by safety recall 23V-456 (airbag inflator). Ask them to book a free service appointment and capture their preferred date. Keep the call under 90 seconds and clearly identify yourself as an AI assistant.",
    first_message:
      "Hello, this is the BMW Service AI assistant calling about an important safety recall on your vehicle. Is now a good time?",
    extraction_schema: [
      { key: "agreed_to_book", type: "boolean", desc: "Did the owner agree to book a service appointment?" },
      { key: "preferred_date", type: "string", desc: "Owner's preferred appointment date/time." },
      { key: "callback_needed", type: "boolean", desc: "Does the owner want a human callback?" },
    ],
    voice_id: "voice_rachel",
    language: "en",
    concurrency: 2,
    retry_delay_minutes: 15,
    max_attempts: 3,
    retry_on: ["no_answer", "busy", "failed"],
    eleven_agent_id: "agent_bmw_001",
    created_at: iso(-1000 * 60 * 60 * 4),
    started_at: iso(-1000 * 60 * 12),
    finished_at: null,
    contact_count: 6,
  },
  {
    id: "cmp_insurance_renewal",
    name: "Auto Insurance Renewal Reminder",
    goal: "Remind customers their policy expires soon and offer to renew over the phone.",
    reason: "Q2 policy renewals — 412 policies lapse this month.",
    status: "draft",
    script_prompt:
      "You are an AI assistant from Meridian Insurance calling {name}. Their policy ({context}) is expiring soon. Offer to renew and capture interest.",
    first_message:
      "Hi, this is the Meridian Insurance assistant. I'm calling about your upcoming policy renewal.",
    extraction_schema: [
      { key: "wants_renewal", type: "boolean", desc: "Does the customer want to renew?" },
      { key: "callback_needed", type: "boolean", desc: "Wants a human agent to follow up?" },
    ],
    voice_id: "voice_adam",
    language: "en",
    concurrency: 5,
    retry_delay_minutes: 30,
    max_attempts: 2,
    retry_on: ["no_answer", "busy"],
    eleven_agent_id: null,
    created_at: iso(-1000 * 60 * 60 * 28),
    started_at: null,
    finished_at: null,
    contact_count: 3,
  },
  {
    id: "cmp_service_followup",
    name: "Post-Service Satisfaction Follow-up",
    goal: "Collect a satisfaction rating after a recent dealership service visit.",
    reason: "May service visits — quality assurance survey.",
    status: "completed",
    script_prompt:
      "You are an AI assistant from Apex Motors calling {name} to ask about their recent service visit ({context}).",
    first_message:
      "Hello, this is the Apex Motors assistant following up on your recent service visit.",
    extraction_schema: [
      { key: "satisfaction_score", type: "number", desc: "1-5 satisfaction rating." },
      { key: "would_recommend", type: "boolean", desc: "Would recommend the dealership?" },
    ],
    voice_id: "voice_bella",
    language: "en",
    concurrency: 3,
    retry_delay_minutes: 20,
    max_attempts: 2,
    retry_on: ["no_answer", "busy", "failed"],
    eleven_agent_id: "agent_apex_007",
    created_at: iso(-1000 * 60 * 60 * 72),
    started_at: iso(-1000 * 60 * 60 * 70),
    finished_at: iso(-1000 * 60 * 60 * 69),
    contact_count: 4,
  },
];

const CONTACTS: Record<string, CampaignContact[]> = {
  cmp_bmw_airbag: [
    mkContact("cmp_bmw_airbag", "c1", "Berat", "+4915112345678", "2021 BMW 330i — VIN ...4821, recall 23V-456"),
    mkContact("cmp_bmw_airbag", "c2", "Teammate", "+4915187654321", "2020 BMW X3 — VIN ...9913, recall 23V-456"),
    mkContact("cmp_bmw_airbag", "c3", "Anna Müller", "+4917622233344", "2019 BMW 520d — VIN ...1077"),
    mkContact("cmp_bmw_airbag", "c4", "Lukas Schmidt", "+4916099988877", "2022 BMW M340i — VIN ...3320"),
    mkContact("cmp_bmw_airbag", "c5", "Sofia Rossi", "+4915255544433", "2018 BMW 118i — VIN ...6654"),
    mkContact("cmp_bmw_airbag", "c6", "James Carter", "+4917011122233", "2021 BMW iX3 — VIN ...8890"),
  ],
  cmp_insurance_renewal: [
    mkContact("cmp_insurance_renewal", "i1", "Emma Becker", "+4915133344455", "Policy MR-2231, expires Jun 30"),
    mkContact("cmp_insurance_renewal", "i2", "Noah Weber", "+4917688877766", "Policy MR-2240, expires Jul 02"),
    mkContact("cmp_insurance_renewal", "i3", "Mia Hofmann", "+4916044455566", "Policy MR-2255, expires Jul 05"),
  ],
  cmp_service_followup: [
    mkContact("cmp_service_followup", "s1", "Oliver Klein", "+4915199911122", "Oil change, May 12", "completed", "answered", { satisfaction_score: 5, would_recommend: true }),
    mkContact("cmp_service_followup", "s2", "Hannah Vogel", "+4917633322211", "Brake service, May 14", "completed", "answered", { satisfaction_score: 4, would_recommend: true }),
    mkContact("cmp_service_followup", "s3", "Leon Fischer", "+4916077766655", "Tire rotation, May 15", "exhausted", "no_answer", null),
    mkContact("cmp_service_followup", "s4", "Clara Wagner", "+4915288899900", "Battery replacement, May 18", "completed", "answered", { satisfaction_score: 3, would_recommend: false }),
  ],
};

function mkContact(
  campaignId: string,
  id: string,
  name: string,
  phone: string,
  context: string,
  status: ContactStatus = "pending",
  last_outcome: CallOutcome | null = null,
  result: Record<string, unknown> | null = null
): CampaignContact {
  return {
    id: `${campaignId}_${id}`,
    campaign_id: campaignId,
    name,
    phone,
    context,
    language: "en",
    status,
    attempts: status === "pending" ? 0 : 1,
    last_outcome,
    result,
    created_at: iso(-1000 * 60 * 60 * 5),
  };
}

// ── Read API (mock) ─────────────────────────────────────────────────────────

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function getCampaigns(): Campaign[] {
  return clone(CAMPAIGNS);
}

export function getCampaign(id: string): Campaign | undefined {
  return clone(CAMPAIGNS.find((c) => c.id === id));
}

export function getContacts(campaignId: string): CampaignContact[] {
  return clone(CONTACTS[campaignId] ?? []);
}

// ── Live simulation (subscribeLive) ─────────────────────────────────────────

interface SimState {
  status: ContactStatus;
  attempts: number;
  last_outcome: CallOutcome | null;
  result: Record<string, unknown> | null;
}

const AGENT_LINES = [
  "Hello, this is the BMW Service AI assistant calling about a safety recall on your vehicle.",
  "Your vehicle is affected by recall 23V-456 — it's a free airbag inflator replacement.",
  "Would you like to book a service appointment at your local dealer?",
  "Great — what day works best for you this week?",
  "Perfect, I've noted that down. You'll receive a confirmation by SMS shortly.",
  "Thank you for your time, and drive safely. Goodbye.",
];

const CALLEE_LINES = [
  "Yes, hello? Who is this?",
  "Oh, a recall? I hadn't heard about that.",
  "Sure, I can come in. Is it really free?",
  "Tuesday afternoon would work for me.",
  "Okay, sounds good. Thanks for letting me know.",
];

const SAMPLE_RESULTS: Array<Record<string, unknown>> = [
  { agreed_to_book: true, preferred_date: "Tue afternoon", callback_needed: false },
  { agreed_to_book: true, preferred_date: "Thu morning", callback_needed: false },
  { agreed_to_book: false, preferred_date: "", callback_needed: true },
  { agreed_to_book: true, preferred_date: "Sat 10:00", callback_needed: false },
];

/**
 * Simulate a running campaign. Calls `onEvent` repeatedly with LiveEvent
 * objects as contacts move through calling → completed/retry/failed, while
 * streaming transcript turns and emitting rolling aggregates.
 *
 * Concurrency is held at ~2 in-flight calls. Returns an unsubscribe function.
 */
export function subscribeLive(
  campaignId: string,
  onEvent: (event: LiveEvent) => void
): () => void {
  const contacts = getContacts(campaignId);
  const sim: Record<string, SimState> = {};
  for (const c of contacts) {
    sim[c.id] = {
      status: c.status,
      attempts: c.attempts,
      last_outcome: c.last_outcome,
      result: c.result,
    };
  }

  const CONCURRENCY = 2;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  const total = contacts.length;
  const terminal = (s: ContactStatus) =>
    s === "completed" || s === "failed" || s === "exhausted";

  function emitAggregate() {
    const counts = {
      pending: 0,
      calling: 0,
      retry_wait: 0,
      completed: 0,
      failed: 0,
      exhausted: 0,
    };
    for (const id in sim) counts[sim[id].status]++;
    const finishedOk = counts.completed;
    const finishedAny = counts.completed + counts.failed + counts.exhausted;
    onEvent({
      type: "aggregate",
      ...counts,
      total,
      successRate: finishedAny > 0 ? finishedOk / finishedAny : 0,
    });
  }

  function setStatus(contactId: string, status: ContactStatus) {
    if (stopped) return;
    const s = sim[contactId];
    s.status = status;
    onEvent({
      type: "contact_status",
      contactId,
      status,
      attempts: s.attempts,
      last_outcome: s.last_outcome,
    });
    emitAggregate();
  }

  function schedule(fn: () => void, delay: number) {
    const t = setTimeout(() => {
      if (!stopped) fn();
    }, delay);
    timers.push(t);
  }

  // Drive one call attempt for a contact.
  function runCall(contactId: string) {
    if (stopped) return;
    const s = sim[contactId];
    s.attempts += 1;
    setStatus(contactId, "calling");

    // Decide an outcome. First attempts mostly answer; retries lean answered.
    const roll = Math.random();
    let outcome: CallOutcome;
    if (s.attempts === 1) {
      outcome = roll < 0.55 ? "answered" : roll < 0.8 ? "no_answer" : roll < 0.92 ? "busy" : "failed";
    } else {
      outcome = roll < 0.75 ? "answered" : roll < 0.9 ? "no_answer" : "failed";
    }
    s.last_outcome = outcome;

    if (outcome === "answered") {
      // Stream a staggered transcript, then finish.
      const turns = Math.min(AGENT_LINES.length, 4 + Math.floor(Math.random() * 2));
      let delay = 1200;
      for (let i = 0; i < turns; i++) {
        const agentText = AGENT_LINES[i] ?? AGENT_LINES[AGENT_LINES.length - 1];
        schedule(() => {
          onEvent({ type: "transcript", contactId, role: "agent", text: agentText });
        }, delay);
        delay += 1600 + Math.random() * 1200;
        if (i < CALLEE_LINES.length) {
          const calleeText = CALLEE_LINES[i];
          schedule(() => {
            onEvent({ type: "transcript", contactId, role: "callee", text: calleeText });
          }, delay);
          delay += 1400 + Math.random() * 1000;
        }
      }
      schedule(() => {
        const result = SAMPLE_RESULTS[Math.floor(Math.random() * SAMPLE_RESULTS.length)];
        s.result = result;
        onEvent({ type: "result", contactId, result });
        setStatus(contactId, "completed");
        next();
      }, delay + 800);
    } else {
      // Not answered → retry if attempts remain, else terminal.
      const maxAttempts = 3;
      schedule(() => {
        if (s.attempts < maxAttempts) {
          setStatus(contactId, "retry_wait");
          // Short fake retry window (~12s) with a visible countdown.
          let remaining = 12;
          const tick = () => {
            if (stopped) return;
            onEvent({ type: "retry_countdown", contactId, secondsRemaining: remaining });
            remaining -= 1;
            if (remaining >= 0) {
              schedule(tick, 1000);
            } else {
              runCall(contactId);
            }
          };
          tick();
        } else {
          setStatus(contactId, "exhausted");
          next();
        }
      }, 2500 + Math.random() * 1500);
    }
  }

  // Pull the next pending contact into an open call slot.
  function inFlight() {
    return Object.values(sim).filter((s) => s.status === "calling").length;
  }
  function next() {
    if (stopped) return;
    while (inFlight() < CONCURRENCY) {
      const nextId = contacts.find((c) => sim[c.id].status === "pending")?.id;
      if (!nextId) break;
      // Mark immediately so the slot is reserved, stagger the actual start.
      sim[nextId].status = "calling";
      const startDelay = 300 + Math.random() * 900;
      const id = nextId;
      schedule(() => {
        // reset then runCall sets it to calling + bumps attempts
        sim[id].status = "pending";
        runCall(id);
      }, startDelay);
    }
    // Completion check.
    if (Object.values(sim).every((s) => terminal(s.status))) {
      schedule(() => {
        onEvent({ type: "campaign_status", status: "completed" });
      }, 600);
    }
  }

  // Kick off after a short delay so subscribers can render first.
  schedule(() => {
    emitAggregate();
    next();
  }, 500);

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
  };
}
