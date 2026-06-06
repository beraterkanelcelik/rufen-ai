interface ProgressBarProps {
  value: number; // 0..1
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  className = "",
  showLabel = false,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#212121]">
        <div
          className="h-full rounded-full bg-[#F97316] transition-[width] duration-500 ease-out shadow-[0_0_12px_-2px_rgba(249,115,22,0.8)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 text-right text-xs tabular-nums text-[#8a8a8a]">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
