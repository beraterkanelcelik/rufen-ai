import { useEffect, useRef, useState } from "react";
import { generateScript } from "../../api";
import type { ExtractionField } from "../../types";
import { Button } from "../ui/Button";
import { RefreshIcon, SparklesIcon } from "../ui/icons";
import { Field, Select, TextArea, TextInput } from "./fields";
import type { StepProps } from "./types";

const FIELD_TYPES: ExtractionField["type"][] = [
  "string",
  "boolean",
  "number",
  "date",
];

export function Step3Script({ draft, update }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  // Auto-draft the moment the user lands on this step (the wizard forces a
  // generated script before advancing anyway) so there's no empty/glitchy gap.
  useEffect(() => {
    if (!autoTried.current && !draft.generated && !busy && draft.goal && draft.reason) {
      autoTried.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real AI generation via the backend orchestration LLM (Claude/GPT).
  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const fields = ["name", "context"];
      const out = await generateScript(draft.goal, draft.reason, fields);
      update({
        generated: true,
        script_prompt: out.script_prompt,
        first_message: out.first_message,
        extraction_schema: out.extraction_schema,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
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
          <p className="mt-1 text-sm text-muted">
            AI drafts the calling instructions, opening line, and the fields to
            capture. Edit anything below.
          </p>
        </div>
        {draft.generated && (
          <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
            {busy ? (
              "Regenerating…"
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <RefreshIcon className="h-3.5 w-3.5" /> Regenerate
              </span>
            )}
          </Button>
        )}
      </div>

      {!draft.generated ? (
        <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-border px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            Generate the call script with AI
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            Uses your goal, reason, and the contact columns ({"{name}"},{" "}
            {"{context}"}) to draft a system prompt, first message, and
            extraction schema.
          </p>
          <Button className="mt-5" onClick={generate} disabled={busy}>
            {busy ? (
              "Generating…"
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <SparklesIcon className="h-4 w-4" /> Generate with AI
              </span>
            )}
          </Button>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
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
              <span className="text-sm font-medium text-foreground">
                Extraction fields
              </span>
              <Button variant="ghost" size="sm" onClick={addField}>
                + Add field
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted">
              Typed fields captured from each call (e.g. agreed: boolean).
            </p>

            <div className="space-y-2">
              {draft.extraction_schema.length === 0 && (
                <p className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                  No fields yet. Add one to capture structured results.
                </p>
              )}
              {draft.extraction_schema.map((f, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,9rem)_8rem_minmax(0,1fr)_auto] items-start gap-2 rounded-[8px] border border-border bg-background p-2"
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
                    className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
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
