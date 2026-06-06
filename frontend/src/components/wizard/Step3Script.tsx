import { useState } from "react";
import type { ExtractionField } from "../../types";
import { Button } from "../ui/Button";
import { Field, Select, TextArea, TextInput } from "./fields";
import type { StepProps, WizardDraft } from "./types";

const FIELD_TYPES: ExtractionField["type"][] = [
  "string",
  "boolean",
  "number",
  "date",
];

// Mock "LLM" generation — derives a plausible script from the goal/reason.
// Two canned variants so Regenerate visibly changes the output.
function mockGenerate(draft: WizardDraft, variant: number): Partial<WizardDraft> {
  const company =
    draft.name?.split(/\s+/)[0] || "our team";
  const goal = draft.goal.trim() || "complete the requested action";
  const reason = draft.reason.trim() || "an important update";

  const prompts = [
    `You are an AI assistant calling on behalf of ${company}. Politely greet {name} and explain the reason for your call: ${reason}. Your objective is to ${goal.toLowerCase()}. Reference the customer's details ({context}) where relevant. Keep the call under 90 seconds, be warm and concise, and clearly identify yourself as an AI assistant. If the person is busy, offer to call back.`,
    `You are a friendly AI voice assistant from ${company}. Clearly state that you are an AI assistant. Address {name} by name and bring up their specific situation ({context}). Reason for the call: ${reason}. Goal: ${goal.toLowerCase()}. Be respectful of their time, confirm next steps before ending, and never pressure the customer.`,
  ];

  const firsts = [
    `Hello, this is the ${company} AI assistant calling about ${reason.toLowerCase()}. Is now a good time to talk?`,
    `Hi {name}, this is an AI assistant from ${company} — I'm reaching out regarding ${reason.toLowerCase()}. Do you have a quick moment?`,
  ];

  const schemas: ExtractionField[][] = [
    [
      {
        key: "agreed",
        type: "boolean",
        desc: "Did the customer agree to the requested action?",
      },
      {
        key: "preferred_date",
        type: "string",
        desc: "Any preferred date or time the customer mentioned.",
      },
      {
        key: "callback_needed",
        type: "boolean",
        desc: "Does the customer want a human to call them back?",
      },
    ],
    [
      {
        key: "outcome_summary",
        type: "string",
        desc: "One-line summary of how the call went.",
      },
      {
        key: "agreed",
        type: "boolean",
        desc: "Did the customer commit to the goal?",
      },
      {
        key: "objection",
        type: "string",
        desc: "Main objection or concern raised, if any.",
      },
      {
        key: "callback_needed",
        type: "boolean",
        desc: "Wants a human follow-up call?",
      },
    ],
  ];

  const i = variant % 2;
  return {
    generated: true,
    script_prompt: prompts[i],
    first_message: firsts[i],
    extraction_schema: schemas[i],
  };
}

export function Step3Script({ draft, update }: StepProps) {
  const [variant, setVariant] = useState(0);
  const [busy, setBusy] = useState(false);

  function generate() {
    setBusy(true);
    const v = draft.generated ? variant + 1 : variant;
    // Tiny delay so the button shows a working state (mock "thinking").
    setTimeout(() => {
      update(mockGenerate(draft, v));
      setVariant(v);
      setBusy(false);
    }, 650);
  }

  function patchField(idx: number, patch: Partial<ExtractionField>) {
    const next = draft.extraction_schema.map((f, i) =>
      i === idx ? { ...f, ...patch } : f
    );
    update({ extraction_schema: next });
  }

  function removeField(idx: number) {
    update({
      extraction_schema: draft.extraction_schema.filter((_, i) => i !== idx),
    });
  }

  function addField() {
    update({
      extraction_schema: [
        ...draft.extraction_schema,
        { key: "new_field", type: "string", desc: "" },
      ],
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Script</h2>
          <p className="mt-1 text-sm text-[#8a8a8a]">
            AI drafts the calling instructions, opening line, and the fields to
            capture. Edit anything below.
          </p>
        </div>
        {draft.generated && (
          <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
            {busy ? "Regenerating…" : "↻ Regenerate"}
          </Button>
        )}
      </div>

      {!draft.generated ? (
        <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[#212121] px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316]/15 text-2xl">
            ✦
          </div>
          <p className="mt-3 text-sm font-medium text-[#e0e0e0]">
            Generate the call script with AI
          </p>
          <p className="mt-1 max-w-sm text-xs text-[#8a8a8a]">
            Uses your goal, reason, and the contact columns ({"{name}"},{" "}
            {"{context}"}) to draft a system prompt, first message, and
            extraction schema.
          </p>
          <Button className="mt-5" onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "✦ Generate with AI"}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Field
            label="System prompt"
            hint="The agent's calling instructions"
          >
            <TextArea
              rows={6}
              value={draft.script_prompt}
              onChange={(e) => update({ script_prompt: e.target.value })}
            />
          </Field>

          <Field label="First message" hint="The opening line">
            <TextArea
              rows={2}
              value={draft.first_message}
              onChange={(e) => update({ first_message: e.target.value })}
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[#e0e0e0]">
                Extraction fields
              </span>
              <Button variant="ghost" size="sm" onClick={addField}>
                + Add field
              </Button>
            </div>
            <p className="mb-3 text-xs text-[#8a8a8a]">
              Typed fields captured from each call (e.g. agreed: boolean).
            </p>

            <div className="space-y-2">
              {draft.extraction_schema.length === 0 && (
                <p className="rounded-[8px] border border-dashed border-[#212121] px-3 py-4 text-center text-xs text-[#8a8a8a]">
                  No fields yet. Add one to capture structured results.
                </p>
              )}
              {draft.extraction_schema.map((f, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,9rem)_8rem_minmax(0,1fr)_auto] items-start gap-2 rounded-[8px] border border-[#212121] bg-[#0a0a0a] p-2"
                >
                  <TextInput
                    value={f.key}
                    placeholder="field_key"
                    className="font-mono text-xs"
                    onChange={(e) => patchField(i, { key: e.target.value })}
                  />
                  <Select
                    value={f.type}
                    onChange={(e) =>
                      patchField(i, {
                        type: e.target.value as ExtractionField["type"],
                      })
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    value={f.desc}
                    placeholder="What to capture…"
                    onChange={(e) => patchField(i, { desc: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    aria-label="Remove field"
                    className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[#8a8a8a] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
