import { Field, TextArea, TextInput } from "./fields";
import type { StepProps } from "./types";

export function Step2Goal({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Goal &amp; reason</h2>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Describe the campaign once. The AI uses this to write the call script.
        </p>
      </div>

      <Field label="Campaign name">
        <TextInput
          value={draft.name}
          placeholder="e.g. BMW Airbag Recall 23V-456"
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>

      <Field
        label="Goal"
        hint="What should each call achieve?"
      >
        <TextArea
          rows={3}
          value={draft.goal}
          placeholder="Get owners to book a recall service appointment at their local dealer."
          onChange={(e) => update({ goal: e.target.value })}
        />
      </Field>

      <Field
        label="Reason / background"
        hint="Context the agent can rely on"
      >
        <TextArea
          rows={3}
          value={draft.reason}
          placeholder="Mandatory airbag inflator recall (23V-456). Affected VINs must be serviced within 30 days."
          onChange={(e) => update({ reason: e.target.value })}
        />
      </Field>
    </div>
  );
}
