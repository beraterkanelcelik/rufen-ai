/**
 * Renders the Qwen insights text. The model is asked for three labelled sections
 * (Summary / Sentiment / Insights); we parse leniently and fall back to plain
 * text if the format drifts.
 */

interface Parsed {
  summary?: string;
  sentiment?: string;
  insights: string[];
}

const SENTIMENT_TONE: Record<string, string> = {
  positive: "border-[#10B981]/40 bg-[#10B981]/12 text-[#34d399]",
  mixed: "border-amber-500/40 bg-amber-500/12 text-amber-400",
  neutral: "border-white/15 bg-white/5 text-muted",
  negative: "border-red-500/40 bg-red-500/12 text-red-400",
};

function parse(text: string): Parsed | null {
  const get = (label: string) => {
    const re = new RegExp(`${label}\\s*:(.*?)(?=\\n\\s*(?:Summary|Sentiment|Insights)\\s*:|$)`, "is");
    return text.match(re)?.[1]?.trim();
  };
  const summary = get("Summary");
  const sentiment = get("Sentiment");
  const insightsBlock = get("Insights");
  if (!summary && !sentiment && !insightsBlock) return null;
  const insights = (insightsBlock ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  return { summary, sentiment, insights };
}

function sentimentMood(s: string): string {
  const first = s.toLowerCase().match(/positive|negative|neutral|mixed/)?.[0];
  return first ?? "neutral";
}

export function InsightsView({ text }: { text: string }) {
  const parsed = parse(text);
  if (!parsed) {
    return (
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {text}
      </p>
    );
  }

  const { summary, sentiment, insights } = parsed;
  const mood = sentiment ? sentimentMood(sentiment) : null;
  // strip the leading mood word so the chip doesn't duplicate it
  const sentimentBody = sentiment
    ? sentiment.replace(/^(positive|negative|neutral|mixed)[\s.:,-]*/i, "").trim()
    : "";

  return (
    <div className="mt-4 space-y-4">
      {summary && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Summary
          </h3>
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        </div>
      )}

      {sentiment && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Sentiment
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {mood && (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
                  SENTIMENT_TONE[mood] ?? SENTIMENT_TONE.neutral
                }`}
              >
                {mood}
              </span>
            )}
            {sentimentBody && (
              <span className="text-sm leading-relaxed text-foreground">
                {sentimentBody}
              </span>
            )}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Insights
          </h3>
          <ul className="space-y-1.5">
            {insights.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
