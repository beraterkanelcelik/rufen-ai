import type { CampaignContact, ExtractionField, TranscriptTurn } from "../../types";
import { ContactStatusBadge, OutcomeBadge } from "../ui/Badge";
import { ResultFields } from "./ResultFields";
import { TranscriptView } from "./TranscriptView";

interface ContactRowProps {
  contact: CampaignContact;
  schema: ExtractionField[];
  transcript: TranscriptTurn[];
  retrySeconds: number | null;
  expanded: boolean;
  onToggle: () => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function ContactRow({
  contact: c,
  schema,
  transcript,
  retrySeconds,
  expanded,
  onToggle,
}: ContactRowProps) {
  const isCalling = c.status === "calling";
  const isRetry = c.status === "retry_wait";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-border transition-colors hover:bg-white/[0.025] ${
          isCalling ? "bg-primary/[0.04]" : ""
        }`}
      >
        <td className="py-3 pl-4 pr-2">
          <div className="flex items-center gap-2">
            <Chevron open={expanded} />
            <span className="font-medium text-white">{c.name}</span>
          </div>
        </td>
        <td className="px-2 py-3 font-mono text-xs text-muted">{c.phone}</td>
        <td className="px-2 py-3">
          <div className="flex items-center gap-2">
            <ContactStatusBadge status={c.status} />
            {isRetry && retrySeconds != null && retrySeconds >= 0 && (
              <span className="text-[11px] tabular-nums text-amber-400">
                retry in {retrySeconds}s
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-3 text-center tabular-nums text-[#c0c0c0]">
          {c.attempts}
        </td>
        <td className="px-2 py-3">
          <div className="flex items-center gap-2">
            <OutcomeBadge outcome={c.last_outcome} />
            {c.sms_sent && (
              <span
                title="Confirmation SMS sent"
                className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/40 bg-[#10B981]/12 px-2 py-0.5 text-[11px] font-medium text-[#34d399]"
              >
                SMS ✓
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-3 pr-4">
          <ResultFields result={c.result} schema={schema} variant="compact" />
        </td>
      </tr>

      {expanded && (
        <tr className="border-t border-border bg-panel">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Transcript
                  </h4>
                  {isRetry && retrySeconds != null && retrySeconds >= 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                      <span className="rufen-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Retrying in {retrySeconds}s
                    </span>
                  )}
                </div>
                <div className="rounded-[8px] border border-border bg-background p-3">
                  <TranscriptView turns={transcript} active={isCalling} />
                </div>
                <div className="mt-2 text-[11px] text-subtle">{c.context}</div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Extracted fields
                </h4>
                {c.result ? (
                  <ResultFields result={c.result} schema={schema} variant="full" />
                ) : (
                  <div className="rounded-[8px] border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
                    {isCalling
                      ? "Extracting once the call completes…"
                      : "No results captured yet."}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
