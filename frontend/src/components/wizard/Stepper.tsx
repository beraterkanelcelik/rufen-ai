interface StepperProps {
  steps: string[];
  current: number; // 0-based index
  onJump?: (index: number) => void;
}

export function Stepper({ steps, current, onJump }: StepperProps) {
  return (
    <nav className="flex items-center">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = !!onJump && i <= current;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onJump?.(i)}
              className={`group flex items-center gap-2.5 ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary text-white shadow-[0_0_16px_-4px_rgba(249,115,22,0.8)]"
                    : done
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-transparent text-muted"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`hidden text-xs font-medium sm:block ${
                  active
                    ? "text-white"
                    : done
                      ? "text-foreground group-hover:text-white"
                      : "text-muted"
                }`}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={`mx-2 h-px flex-1 transition-colors ${
                  i < current ? "bg-primary/50" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
