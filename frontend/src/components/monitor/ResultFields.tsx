import type { ExtractionField } from "../../types";

interface ResultFieldsProps {
  result: Record<string, unknown> | null;
  schema: ExtractionField[];
  /** compact = inline chips for the table cell; full = labeled grid */
  variant?: "compact" | "full";
}

function fmt(value: unknown): { text: string; tone: "neutral" | "green" | "red" } {
  if (value === null || value === undefined || value === "") {
    return { text: "—", tone: "neutral" };
  }
  if (typeof value === "boolean") {
    return value
      ? { text: "yes", tone: "green" }
      : { text: "no", tone: "red" };
  }
  return { text: String(value), tone: "neutral" };
}

const TONE_CLS: Record<"neutral" | "green" | "red", string> = {
  neutral: "bg-white/5 text-[#c0c0c0] border-[#212121]",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
};

const label = (k: string) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export function ResultFields({
  result,
  schema,
  variant = "compact",
}: ResultFieldsProps) {
  if (!result || Object.keys(result).length === 0) {
    return <span className="text-xs text-[#8a8a8a]">—</span>;
  }

  // Use the schema for ordering/labels, but include any extra keys too.
  const keys = [
    ...schema.map((f) => f.key).filter((k) => k in result),
    ...Object.keys(result).filter((k) => !schema.some((f) => f.key === k)),
  ];

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap gap-1">
        {keys.slice(0, 3).map((k) => {
          const { text, tone } = fmt(result[k]);
          return (
            <span
              key={k}
              title={`${label(k)}: ${text}`}
              className={`inline-flex max-w-[10rem] items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px] ${TONE_CLS[tone]}`}
            >
              <span className="text-[#8a8a8a]">{label(k)}:</span>
              <span className="font-medium">{text}</span>
            </span>
          );
        })}
        {keys.length > 3 && (
          <span className="text-[10px] text-[#8a8a8a]">+{keys.length - 3}</span>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {keys.map((k) => {
        const { text, tone } = fmt(result[k]);
        const field = schema.find((f) => f.key === k);
        return (
          <div
            key={k}
            className="rounded-[8px] border border-[#212121] bg-[#0a0a0a] px-3 py-2"
          >
            <div className="text-[11px] uppercase tracking-wide text-[#8a8a8a]">
              {label(k)}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${TONE_CLS[tone]}`}
              >
                {text}
              </span>
            </div>
            {field?.desc && (
              <div className="mt-1 text-[10px] leading-snug text-[#6a6a6a]">
                {field.desc}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
