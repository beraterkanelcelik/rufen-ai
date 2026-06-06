import type { CallOutcome } from "../../types";
import { Pill } from "../ui/Badge";
import { Field, TextInput } from "./fields";
import type { StepProps } from "./types";

const CONCURRENCY_CAP = 2; // Free plan = min(ElevenLabs, Telnyx) = 2

const RETRYABLE: { value: CallOutcome; label: string; help: string }[] = [
  { value: "no_answer", label: "No answer", help: "Nobody picked up" },
  { value: "busy", label: "Busy", help: "Line was busy" },
  { value: "failed", label: "Failed", help: "Call could not connect" },
  { value: "answered", label: "Answered", help: "Rarely retried" },
];

export function Step5Settings({ draft, update }: StepProps) {
  function toggleRetry(o: CallOutcome) {
    const has = draft.retry_on.includes(o);
    update({
      retry_on: has
        ? draft.retry_on.filter((x) => x !== o)
        : [...draft.retry_on, o],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Run settings</h2>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Control how aggressively the agents work the list.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-medium text-[#e0e0e0]">
            Concurrency
          </span>
          <span className="text-xs text-[#8a8a8a]">
            <span className="font-mono text-[#e0e0e0]">
              {draft.concurrency}
            </span>{" "}
            of {CONCURRENCY_CAP} max
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={CONCURRENCY_CAP}
          step={1}
          value={draft.concurrency}
          onChange={(e) => update({ concurrency: Number(e.target.value) })}
          className="w-full accent-[#F97316]"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-[#8a8a8a]">1 call at a time</span>
          <Pill tone="neutral">Free plan cap = {CONCURRENCY_CAP}</Pill>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Retry delay" hint="minutes">
          <TextInput
            type="number"
            min={1}
            value={draft.retry_delay_minutes}
            onChange={(e) =>
              update({
                retry_delay_minutes: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </Field>
        <Field label="Max attempts" hint="per contact">
          <TextInput
            type="number"
            min={1}
            max={5}
            value={draft.max_attempts}
            onChange={(e) =>
              update({
                max_attempts: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
              })
            }
          />
        </Field>
      </div>

      <div>
        <span className="text-sm font-medium text-[#e0e0e0]">
          Retry on outcomes
        </span>
        <p className="mb-3 mt-1 text-xs text-[#8a8a8a]">
          Which results should trigger another attempt? Stops on others.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RETRYABLE.map((r) => {
            const checked = draft.retry_on.includes(r.value);
            return (
              <label
                key={r.value}
                className={`flex cursor-pointer items-center gap-3 rounded-[8px] border p-3 transition-colors ${
                  checked
                    ? "border-[#F97316]/50 bg-[#F97316]/[0.06]"
                    : "border-[#212121] hover:border-[#F97316]/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRetry(r.value)}
                  className="h-4 w-4 accent-[#F97316]"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-[#e0e0e0]">
                    {r.label}
                  </span>
                  <span className="block text-xs text-[#8a8a8a]">{r.help}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
