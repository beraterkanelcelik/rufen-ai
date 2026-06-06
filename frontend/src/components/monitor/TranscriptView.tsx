import { useEffect, useRef } from "react";
import type { TranscriptTurn } from "../../types";

interface TranscriptViewProps {
  turns: TranscriptTurn[];
  /** show a typing indicator (call is in progress) */
  active?: boolean;
}

export function TranscriptView({ turns, active = false }: TranscriptViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest turn as the transcript streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, active]);

  if (turns.length === 0 && !active) {
    return (
      <div className="py-6 text-center text-xs text-muted">
        No transcript yet for this contact.
      </div>
    );
  }

  return (
    <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
      {turns.map((t, i) => {
        const isAgent = t.role === "agent";
        return (
          <div
            key={i}
            className={`flex ${isAgent ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                isAgent
                  ? "rounded-tl-sm bg-primary/12 text-[#f5d4bb] ring-1 ring-primary/25"
                  : "rounded-tr-sm bg-white/5 text-foreground ring-1 ring-border"
              }`}
            >
              <div
                className={`mb-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  isAgent ? "text-primary" : "text-muted"
                }`}
              >
                {isAgent ? "Agent" : "Callee"}
              </div>
              {t.text}
            </div>
          </div>
        );
      })}

      {active && (
        <div className="flex justify-start">
          <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-primary/12 px-3.5 py-2.5 ring-1 ring-primary/25">
            <Dot delay="0s" />
            <Dot delay="0.2s" />
            <Dot delay="0.4s" />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="rufen-dot inline-block h-1.5 w-1.5 rounded-full bg-primary"
      style={{ animationDelay: delay }}
    />
  );
}
