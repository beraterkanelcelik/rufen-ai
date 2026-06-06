import { composeGoal, composeReason, BRANDS, CAMPAIGN_TYPES, PRIMARY_GOALS, URGENCIES } from "./dealership";
import { Field, Select, TextArea, TextInput } from "./fields";
import type { StepProps, WizardDraft } from "./types";

export function Step2Goal({ draft, update }: StepProps) {
  // Update a field AND recompute the derived goal/reason the AI will use.
  function set(patch: Partial<WizardDraft>) {
    const merged = { ...draft, ...patch };
    update({ ...patch, goal: composeGoal(merged), reason: composeReason(merged) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Campaign details</h2>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Set the dealership campaign parameters — the AI uses these to write a
          tailored call script.
        </p>
      </div>

      {/* Campaign type */}
      <Field label="Campaign type">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CAMPAIGN_TYPES.map((t) => {
            const selected = draft.campaignType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => set({ campaignType: t.id })}
                className={`flex flex-col items-center rounded-[8px] border px-2 py-3 text-center transition-all ${
                  selected
                    ? "border-[#F97316]/60 bg-[#F97316]/[0.06]"
                    : "border-[#212121] hover:border-[#F97316]/40 hover:bg-white/[0.02]"
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                <span className="mt-1 text-xs font-medium text-white">{t.title}</span>
                <span className="text-[10px] text-[#8a8a8a]">{t.sub}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Campaign name">
        <TextInput
          value={draft.name}
          placeholder="e.g. BMW Airbag Recall 23V-456 — Q2"
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Brand / manufacturer">
          <Select value={draft.brand} onChange={(e) => set({ brand: e.target.value })}>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="Urgency">
          <Select value={draft.urgency} onChange={(e) => set({ urgency: e.target.value as WizardDraft["urgency"] })}>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Dealership / location">
          <TextInput
            value={draft.dealershipLocation}
            placeholder="e.g. BMW Zentrum Hamburg-Altona"
            onChange={(e) => set({ dealershipLocation: e.target.value })}
          />
        </Field>
        <Field label="Responsible service manager">
          <TextInput
            value={draft.responsibleEmployee}
            placeholder="e.g. Max Schwarz (Service Lead)"
            onChange={(e) => set({ responsibleEmployee: e.target.value })}
          />
        </Field>
        <Field label="Action / recall ID">
          <TextInput
            value={draft.actionId}
            placeholder="e.g. Recall 23V-456"
            onChange={(e) => set({ actionId: e.target.value })}
          />
        </Field>
        <Field label="Affected models">
          <TextInput
            value={draft.affectedModels}
            placeholder="e.g. X5 (2019–2022), X3"
            onChange={(e) => set({ affectedModels: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Affected part / focus">
        <TextInput
          value={draft.affectedPart}
          placeholder="e.g. Airbag inflator module"
          onChange={(e) => set({ affectedPart: e.target.value })}
        />
      </Field>

      <Field label="Reason & customer explanation" hint="Plain language the agent uses">
        <TextArea
          rows={3}
          value={draft.actionReason}
          placeholder="The airbag inflator may deploy improperly; affected vehicles must be inspected and the part replaced at no cost."
          onChange={(e) => set({ actionReason: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Duration (min)">
          <TextInput
            type="number"
            value={draft.durationMinutes}
            onChange={(e) => set({ durationMinutes: Number(e.target.value) })}
          />
        </Field>
        <Field label="Cost to owner">
          <TextInput
            value={draft.customerCost}
            placeholder="Free of charge"
            onChange={(e) => set({ customerCost: e.target.value })}
          />
        </Field>
        <Field label="Deadline">
          <TextInput
            type="date"
            value={draft.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Primary call goal">
        <Select value={draft.primaryGoal} onChange={(e) => set({ primaryGoal: e.target.value })}>
          {PRIMARY_GOALS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#e0e0e0]">
          <input
            type="checkbox"
            checked={draft.offerLoaner}
            onChange={(e) => set({ offerLoaner: e.target.checked })}
            className="accent-[#F97316]"
          />
          Offer replacement / loaner car
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#e0e0e0]">
          <input
            type="checkbox"
            checked={draft.offerPickup}
            onChange={(e) => set({ offerPickup: e.target.checked })}
            className="accent-[#F97316]"
          />
          Offer pick-up &amp; delivery
        </label>
      </div>

      {/* Live preview of what the AI generator will receive */}
      <div className="rounded-[8px] border border-[#212121] bg-[#0a0a0a] p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8a8a]">
          AI context preview
        </p>
        <p className="text-xs text-[#e0e0e0]">
          <span className="text-[#F97316]">Goal:</span> {draft.goal || "—"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#8a8a8a]">{draft.reason || "—"}</p>
      </div>
    </div>
  );
}
