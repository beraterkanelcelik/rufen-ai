import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { campaignExportUrl, fetchCampaign, fetchContacts, subscribeLive } from "../api";
import type {
  AggregateEvent,
  Campaign,
  CampaignContact,
  CampaignStatus,
  LiveEvent,
  TranscriptTurn,
} from "../types";
import { Button } from "../components/ui/Button";
import { CampaignStatusBadge } from "../components/ui/Badge";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatCard } from "../components/monitor/StatCard";
import { ConcurrencyGauge } from "../components/monitor/ConcurrencyGauge";
import { ContactRow } from "../components/monitor/ContactRow";

type TranscriptMap = Record<string, TranscriptTurn[]>;
type RetryMap = Record<string, number>;

function aggregateFromContacts(contacts: CampaignContact[]): AggregateEvent {
  const counts = {
    pending: 0, calling: 0, retry_wait: 0, completed: 0, failed: 0, exhausted: 0,
  } as Record<string, number>;
  for (const c of contacts) if (c.status in counts) counts[c.status]++;
  const finished = counts.completed + counts.failed + counts.exhausted;
  return {
    type: "aggregate",
    pending: counts.pending,
    calling: counts.calling,
    retry_wait: counts.retry_wait,
    completed: counts.completed,
    failed: counts.failed,
    exhausted: counts.exhausted,
    total: contacts.length,
    successRate: finished ? counts.completed / finished : 0,
  };
}

export default function Monitor() {
  const { id = "" } = useParams();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [agg, setAgg] = useState<AggregateEvent>(() => aggregateFromContacts([]));
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>("draft");
  const [transcripts, setTranscripts] = useState<TranscriptMap>({});
  const [retries, setRetries] = useState<RetryMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [live, setLive] = useState(false);

  // Keep a stable ts counter for synthesized transcript turns.
  const tsRef = useRef(0);

  // ── Load campaign + contacts from the backend ─────────────────────────────
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchCampaign(id), fetchContacts(id)])
      .then(([c, cs]) => {
        if (!active) return;
        setCampaign(c);
        setCampaignStatus(c.status);
        setContacts(cs);
        setAgg(aggregateFromContacts(cs));
        // seed transcripts from saved data so they show after the call / on refresh
        const seeded: TranscriptMap = {};
        for (const ct of cs) {
          if (ct.transcript && ct.transcript.length) seeded[ct.id] = ct.transcript;
        }
        setTranscripts(seeded);
      })
      .catch(() => {
        if (active) setCampaign(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // ── Live subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!campaign) return;
    // Only "running" campaigns get the live simulator. Draft/completed stay static.
    if (campaign.status !== "running") {
      setLive(false);
      return;
    }
    setLive(true);

    const handle = (e: LiveEvent) => {
      switch (e.type) {
        case "contact_status":
          setContacts((prev) =>
            prev.map((c) =>
              c.id === e.contactId
                ? {
                    ...c,
                    status: e.status,
                    attempts: e.attempts,
                    last_outcome: e.last_outcome,
                  }
                : c
            )
          );
          // Auto-open a contact when it starts calling so the live transcript
          // is visible without having to expand the row manually.
          if (e.status === "calling") {
            setExpanded((prev) => ({ ...prev, [e.contactId]: true }));
          }
          // Clear any retry countdown once it leaves retry_wait.
          if (e.status !== "retry_wait") {
            setRetries((prev) => {
              if (!(e.contactId in prev)) return prev;
              const next = { ...prev };
              delete next[e.contactId];
              return next;
            });
          }
          break;

        case "transcript":
          setTranscripts((prev) => {
            const turns = prev[e.contactId] ?? [];
            const turn: TranscriptTurn = {
              role: e.role,
              text: e.text,
              ts: new Date(Date.now() + tsRef.current++).toISOString(),
            };
            return { ...prev, [e.contactId]: [...turns, turn] };
          });
          break;

        case "retry_countdown":
          setRetries((prev) => ({
            ...prev,
            [e.contactId]: e.secondsRemaining,
          }));
          break;

        case "result":
          setContacts((prev) =>
            prev.map((c) =>
              c.id === e.contactId ? { ...c, result: e.result } : c
            )
          );
          break;

        case "aggregate":
          setAgg(e);
          break;

        case "campaign_status":
          setCampaignStatus(e.status);
          if (e.status !== "running") setLive(false);
          break;
      }
    };

    const unsubscribe = subscribeLive(campaign.id, handle);
    return () => unsubscribe();
  }, [campaign]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-sm text-muted">
        Loading campaign…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-xl font-semibold text-white">Campaign not found</h1>
        <p className="mt-2 text-sm text-muted">
          No campaign with id <code className="text-primary">{id}</code>.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to campaigns
        </Link>
      </div>
    );
  }

  const finishedAny = agg.completed + agg.failed + agg.exhausted;
  const progress = agg.total > 0 ? finishedAny / agg.total : 0;

  return (
    <div className="mx-auto max-w-6xl pb-16">
      {/* Header */}
      <div className="mb-5">
        <Link
          to="/"
          className="text-xs text-muted transition-colors hover:text-primary"
        >
          ← Campaigns
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {campaign.name}
              </h1>
              <CampaignStatusBadge status={campaignStatus} />
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {campaign.goal}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.open(campaignExportUrl(campaign.id), "_blank")}
          >
            <DownloadIcon /> Export CSV
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-5 rounded-[8px] border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-white">Campaign progress</span>
          <span className="tabular-nums text-muted">
            {finishedAny} / {agg.total} contacts done · {Math.round(progress * 100)}%
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* Aggregate stat grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <StatCard label="Pending" value={agg.pending} />
        <StatCard
          label="Calling"
          value={agg.calling}
          tone="orange"
          live={agg.calling > 0}
        />
        <StatCard label="Retry wait" value={agg.retry_wait} tone="yellow" />
        <StatCard label="Completed" value={agg.completed} tone="green" />
        <StatCard label="Failed" value={agg.failed} tone="red" />
        <StatCard label="Exhausted" value={agg.exhausted} tone="purple" />
        <StatCard
          label="Success rate"
          value={`${Math.round(agg.successRate * 100)}%`}
          tone={agg.successRate >= 0.5 ? "green" : "default"}
          hint={finishedAny > 0 ? `${agg.completed} of ${finishedAny}` : "no calls yet"}
        />
      </div>

      {/* Concurrency gauge */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:max-w-sm">
        <ConcurrencyGauge active={agg.calling} capacity={campaign.concurrency} />
      </div>

      {/* Contacts table */}
      <div className="overflow-hidden rounded-[8px] border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-white">
            Contacts{" "}
            <span className="text-muted">({contacts.length})</span>
          </h2>
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs text-primary">
              <span className="rufen-dot h-1.5 w-1.5 rounded-full bg-primary" />
              Live
            </span>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            No contacts on this campaign.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2.5 pl-4 pr-2 font-medium">Name</th>
                  <th className="px-2 py-2.5 font-medium">Phone</th>
                  <th className="px-2 py-2.5 font-medium">Status</th>
                  <th className="px-2 py-2.5 text-center font-medium">Attempts</th>
                  <th className="px-2 py-2.5 font-medium">Last outcome</th>
                  <th className="px-2 py-2.5 pr-4 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    schema={campaign.extraction_schema}
                    transcript={transcripts[c.id] ?? []}
                    retrySeconds={
                      c.status === "retry_wait" ? retries[c.id] ?? null : null
                    }
                    expanded={!!expanded[c.id]}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
    </svg>
  );
}
