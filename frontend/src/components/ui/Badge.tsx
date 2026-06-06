import type { ReactNode } from "react";
import type {
  CampaignStatus,
  ContactStatus,
  CallOutcome,
} from "../../types";

type Tone =
  | "neutral"
  | "orange"
  | "green"
  | "red"
  | "blue"
  | "yellow"
  | "purple";

const tones: Record<Tone, string> = {
  neutral: "bg-white/5 text-[#8a8a8a] border-[#212121]",
  orange: "bg-[#F97316]/15 text-[#F97316] border-[#F97316]/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  blue: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  purple: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = {
  draft: "neutral",
  running: "orange",
  paused: "yellow",
  completed: "green",
  cancelled: "red",
};

const CONTACT_TONE: Record<ContactStatus, Tone> = {
  pending: "neutral",
  calling: "orange",
  retry_wait: "yellow",
  completed: "green",
  failed: "red",
  exhausted: "purple",
};

const OUTCOME_TONE: Record<CallOutcome, Tone> = {
  answered: "green",
  no_answer: "yellow",
  busy: "blue",
  failed: "red",
};

const label = (s: string) => s.replace(/_/g, " ");

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Pill tone={CAMPAIGN_TONE[status]}>
      {status === "running" && (
        <span className="rufen-dot h-1.5 w-1.5 rounded-full bg-[#F97316]" />
      )}
      {label(status)}
    </Pill>
  );
}

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return (
    <Pill tone={CONTACT_TONE[status]}>
      {status === "calling" && (
        <span className="rufen-dot h-1.5 w-1.5 rounded-full bg-[#F97316]" />
      )}
      {label(status)}
    </Pill>
  );
}

export function OutcomeBadge({ outcome }: { outcome: CallOutcome | null }) {
  if (!outcome) return <span className="text-[#8a8a8a] text-xs">—</span>;
  return <Pill tone={OUTCOME_TONE[outcome]}>{label(outcome)}</Pill>;
}
