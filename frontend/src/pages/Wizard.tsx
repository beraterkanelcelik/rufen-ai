import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCampaign, launchCampaign } from "../api";
import { Button } from "../components/ui/Button";
import { Card, CardBody } from "../components/ui/Card";
import { Stepper } from "../components/wizard/Stepper";
import { Step1Contacts } from "../components/wizard/Step1Contacts";
import { Step2Goal } from "../components/wizard/Step2Goal";
import { Step3Script } from "../components/wizard/Step3Script";
import { Step4Voice } from "../components/wizard/Step4Voice";
import { Step5Settings } from "../components/wizard/Step5Settings";
import { Step6Review } from "../components/wizard/Step6Review";
import type { WizardDraft } from "../components/wizard/types";

const STEP_LABELS = [
  "Contacts",
  "Goal",
  "Script",
  "Voice",
  "Settings",
  "Review",
];

const INITIAL_DRAFT: WizardDraft = {
  contacts: [],
  fileName: null,
  name: "",
  goal: "",
  reason: "",
  generated: false,
  script_prompt: "",
  first_message: "",
  extraction_schema: [],
  voice_id: "",
  voice_name: "",
  language: "en",
  concurrency: 2,
  retry_delay_minutes: 15,
  max_attempts: 3,
  retry_on: ["no_answer", "busy", "failed"],
};

// Per-step gate: can the user advance from `step`?
function canAdvance(step: number, d: WizardDraft): boolean {
  switch (step) {
    case 0:
      return d.contacts.some((c) => c.valid);
    case 1:
      return d.name.trim().length > 0 && d.goal.trim().length > 0;
    case 2:
      return d.generated;
    case 3:
      return d.voice_id.length > 0;
    case 4:
      return d.concurrency >= 1 && d.max_attempts >= 1;
    default:
      return true;
  }
}

const GATE_HINTS: Record<number, string> = {
  0: "Upload a list with at least one valid contact to continue.",
  1: "Add a campaign name and goal to continue.",
  2: "Generate the script to continue.",
};

export default function Wizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(INITIAL_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const update = (patch: Partial<WizardDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const isLast = step === STEP_LABELS.length - 1;
  const advanceOk = canAdvance(step, draft);

  function next() {
    if (advanceOk && !isLast) setStep((s) => s + 1);
  }
  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function launch() {
    setSubmitting(true);
    setLaunchError(null);
    try {
      const valid = draft.contacts.filter((c) => c.valid);
      const created = await createCampaign({
        name: draft.name,
        goal: draft.goal,
        reason: draft.reason,
        script_prompt: draft.script_prompt,
        first_message: draft.first_message,
        extraction_schema: draft.extraction_schema,
        voice_id: draft.voice_id,
        language: draft.language as "en" | "de",
        concurrency: draft.concurrency,
        retry_delay_minutes: draft.retry_delay_minutes,
        max_attempts: draft.max_attempts,
        retry_on: draft.retry_on,
        contacts: valid.map((c) => ({
          name: c.name,
          phone: c.phone,
          context: c.context ?? "",
          language: c.language ?? draft.language,
        })),
      });
      await launchCampaign(created.id);
      navigate(`/campaign/${created.id}`);
    } catch (e) {
      setLaunchError(String(e));
      setSubmitting(false);
    }
  }

  const StepBody = [
    <Step1Contacts key="1" draft={draft} update={update} />,
    <Step2Goal key="2" draft={draft} update={update} />,
    <Step3Script key="3" draft={draft} update={update} />,
    <Step4Voice key="4" draft={draft} update={update} />,
    <Step5Settings key="5" draft={draft} update={update} />,
    <Step6Review key="6" draft={draft} update={update} />,
  ][step];

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          New Campaign
        </h1>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Six quick steps — each is editable and re-runnable.
        </p>
      </div>

      <div className="mb-6">
        <Stepper
          steps={STEP_LABELS}
          current={step}
          onJump={(i) => setStep(i)}
        />
      </div>

      <Card>
        <CardBody className="pt-5">{StepBody}</CardBody>
      </Card>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={step === 0 ? () => navigate("/") : back}
        >
          {step === 0 ? "Cancel" : "← Back"}
        </Button>

        <div className="flex items-center gap-3">
          {!advanceOk && GATE_HINTS[step] && (
            <span className="hidden text-xs text-[#8a8a8a] sm:block">
              {GATE_HINTS[step]}
            </span>
          )}
          {isLast ? (
            <div className="flex items-center gap-3">
              {launchError && (
                <span className="text-xs text-red-400">{launchError}</span>
              )}
              <Button size="lg" onClick={launch} disabled={submitting}>
                {submitting ? "Launching…" : "▶ Launch campaign"}
              </Button>
            </div>
          ) : (
            <Button onClick={next} disabled={!advanceOk}>
              Continue →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
