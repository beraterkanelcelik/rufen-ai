import type { Language } from "../../types";
import { Field, Select } from "./fields";
import type { StepProps } from "./types";

interface Voice {
  id: string;
  name: string;
  desc: string;
  accent: string;
}

export const VOICES: Voice[] = [
  { id: "voice_rachel", name: "Rachel", desc: "Warm, professional female", accent: "US English" },
  { id: "voice_adam", name: "Adam", desc: "Calm, confident male", accent: "US English" },
  { id: "voice_bella", name: "Bella", desc: "Friendly, upbeat female", accent: "UK English" },
  { id: "voice_lukas", name: "Lukas", desc: "Clear, neutral male", accent: "German" },
];

export function Step4Voice({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Voice &amp; language</h2>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Pick the voice your agent uses on every call.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {VOICES.map((v) => {
          const selected = draft.voice_id === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => update({ voice_id: v.id })}
              className={`flex items-center gap-3 rounded-[8px] border p-3 text-left transition-all ${
                selected
                  ? "border-[#F97316]/60 bg-[#F97316]/[0.06] shadow-[0_0_24px_-10px_rgba(249,115,22,0.6)]"
                  : "border-[#212121] hover:border-[#F97316]/40 hover:bg-white/[0.02]"
              }`}
            >
              <span
                onClick={(e) => e.stopPropagation()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F97316]/15 text-[#F97316]"
                aria-hidden
              >
                ▶
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-white">{v.name}</span>
                  <span className="text-xs text-[#8a8a8a]">{v.accent}</span>
                </span>
                <span className="block truncate text-xs text-[#8a8a8a]">
                  {v.desc}
                </span>
              </span>
              <span
                className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                  selected
                    ? "border-[#F97316] bg-[#F97316]"
                    : "border-[#212121]"
                }`}
              />
            </button>
          );
        })}
      </div>

      <Field label="Default language" hint="Per-contact language overrides this">
        <Select
          value={draft.language}
          onChange={(e) =>
            update({ language: e.target.value as Language })
          }
          className="max-w-xs"
        >
          <option value="en">English</option>
          <option value="de">German (Deutsch)</option>
        </Select>
      </Field>
    </div>
  );
}
