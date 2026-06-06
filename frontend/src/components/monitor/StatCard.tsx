import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** tone for the value color */
  tone?: "default" | "orange" | "green" | "red" | "yellow" | "purple";
  /** small subtitle under the value */
  hint?: ReactNode;
  /** pulse the card border (e.g. when actively calling) */
  live?: boolean;
}

const VALUE_TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-white",
  orange: "text-primary",
  green: "text-emerald-400",
  red: "text-red-400",
  yellow: "text-amber-400",
  purple: "text-violet-400",
};

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
  live = false,
}: StatCardProps) {
  return (
    <div
      className={`rounded-[8px] border bg-card px-4 py-3.5 transition-colors ${
        live
          ? "border-primary/50 shadow-[0_0_24px_-12px_rgba(249,115,22,0.7)]"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {live && (
          <span className="rufen-dot h-1.5 w-1.5 rounded-full bg-primary" />
        )}
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums leading-none ${VALUE_TONE[tone]}`}
      >
        {value}
      </div>
      {hint != null && (
        <div className="mt-1 text-[11px] text-muted">{hint}</div>
      )}
    </div>
  );
}
