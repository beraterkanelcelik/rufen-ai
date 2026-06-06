interface ConcurrencyGaugeProps {
  active: number;
  capacity: number;
}

/**
 * A small horizontal "slots" gauge — one pip per concurrency slot. Filled
 * pips pulse to show live in-flight calls. Used in the monitor header.
 */
export function ConcurrencyGauge({ active, capacity }: ConcurrencyGaugeProps) {
  const cap = Math.max(capacity, 1);
  const filled = Math.max(0, Math.min(active, cap));
  return (
    <div className="rounded-[8px] border border-[#212121] bg-[#121212] px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#8a8a8a]">
          Live calls
        </span>
        <span className="text-sm font-semibold tabular-nums text-white">
          {filled}{" "}
          <span className="text-[#8a8a8a]">/ {cap}</span>
        </span>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {Array.from({ length: cap }).map((_, i) => {
          const on = i < filled;
          return (
            <div
              key={i}
              className={`h-2.5 flex-1 rounded-full transition-colors duration-300 ${
                on
                  ? "rufen-dot bg-[#F97316] shadow-[0_0_10px_-2px_rgba(249,115,22,0.9)]"
                  : "bg-[#212121]"
              }`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 text-[11px] text-[#8a8a8a]">
        {filled > 0
          ? `${filled} call${filled === 1 ? "" : "s"} in progress`
          : "Idle — no active calls"}
      </div>
    </div>
  );
}
