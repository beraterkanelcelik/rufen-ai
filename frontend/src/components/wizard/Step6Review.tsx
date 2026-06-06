import { useEffect, useRef, useState, type ReactNode } from "react";
import { getTestCall, testCall } from "../../api";
import { Card, CardBody } from "../ui/Card";
import { Pill } from "../ui/Badge";
import { Button } from "../ui/Button";
import { TextInput } from "./fields";
import type { StepProps, WizardDraft } from "./types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2 text-sm">
      <span className="w-32 shrink-0 text-[#8a8a8a]">{label}</span>
      <span className="min-w-0 flex-1 text-[#e0e0e0]">{children}</span>
    </div>
  );
}

type Turn = { role: "agent" | "callee"; text: string };

function TestCallCard({ draft }: { draft: WizardDraft }) {
  const [phone, setPhone] = useState("");
  const [convId, setConvId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the live transcript while a test call is in flight.
  useEffect(() => {
    if (!convId) return;
    timer.current = setInterval(async () => {
      try {
        const s = await getTestCall(convId);
        setCallStatus(s.status);
        setTurns(s.transcript);
        setReason(s.reason ?? null);
        if (s.status === "done" || s.status === "failed") {
          if (timer.current) clearInterval(timer.current);
          setBusy(false);
        }
      } catch {
        /* transient — keep polling */
      }
    }, 1500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [convId]);

  async function call() {
    setError(null);
    setTurns([]);
    setConvId(null);
    setCallStatus("");
    setReason(null);
    setBusy(true);
    try {
      const ctx = draft.affectedModels
        ? `${draft.brand} ${draft.affectedModels} — ${draft.actionId}`
        : "a quick test call";
      const res = await testCall({
        phone: phone.trim(),
        script_prompt: draft.script_prompt,
        first_message: draft.first_message,
        voice_id: draft.voice_id,
        language: draft.language,
        extraction_schema: draft.extraction_schema,
        name: "there",
        context: ctx,
      });
      setConvId(res.conversation_id);
      setCallStatus("initiated");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  const valid = /^\+\d{6,15}$/.test(phone.trim());

  return (
    <Card>
      <CardBody className="space-y-3 pt-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Test call (optional)</h3>
          <p className="mt-1 text-xs text-[#8a8a8a]">
            Ring your own phone with this exact script &amp; voice before launching
            the campaign.
          </p>
        </div>
        <div className="flex gap-2">
          <TextInput
            value={phone}
            placeholder="+49…"
            onChange={(e) => setPhone(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={call} disabled={!valid || busy || !draft.generated}>
            {busy ? "Calling…" : "📞 Call my phone"}
          </Button>
        </div>
        {!draft.generated && (
          <p className="text-xs text-[#8a8a8a]">Generate the script first (step 3).</p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {(callStatus || turns.length > 0) && (
          <div className="rounded-[8px] border border-[#212121] bg-[#0a0a0a] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8a8a8a]">
              {callStatus === "done"
                ? "Call finished"
                : callStatus === "failed"
                  ? "Call failed"
                  : `Live · ${callStatus || "connecting"}…`}
            </div>
            {callStatus === "failed" && reason && (
              <p className="mb-2 text-xs text-red-400">{reason}</p>
            )}
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {turns.length === 0 ? (
                <p className="text-xs text-[#8a8a8a]">
                  Pick up your phone — the transcript appears here.
                </p>
              ) : (
                turns.map((t, i) => (
                  <div key={i} className="text-xs">
                    <span
                      className={
                        t.role === "agent" ? "text-[#F97316]" : "text-[#8a8a8a]"
                      }
                    >
                      {t.role === "agent" ? "Agent" : "Callee"}:
                    </span>{" "}
                    <span className="text-[#e0e0e0]">{t.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function Step6Review({ draft }: StepProps) {
  const validContacts = draft.contacts.filter((c) => c.valid).length;
  const voice = draft.voice_id
    ? { name: draft.voice_name || draft.voice_id }
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Review &amp; launch</h2>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Confirm everything looks right, then start calling.
        </p>
      </div>

      <Card>
        <CardBody className="divide-y divide-[#212121] pt-3">
          <Row label="Campaign">
            <span className="font-medium text-white">
              {draft.name || "Untitled campaign"}
            </span>
          </Row>
          <Row label="Type">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Pill tone="orange">{draft.campaignType}</Pill>
              <span className="text-[#8a8a8a]">{draft.brand}</span>
            </span>
          </Row>
          <Row label="Action / models">
            {[draft.actionId, draft.affectedModels].filter(Boolean).join(" · ") || "—"}
          </Row>
          <Row label="Dealership">{draft.dealershipLocation || "—"}</Row>
          <Row label="Goal">{draft.goal || "—"}</Row>
          <Row label="Reason">{draft.reason || "—"}</Row>
          <Row label="Contacts">
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-white">
                {validContacts}
              </span>
              <span className="text-[#8a8a8a]">will be called</span>
              {draft.fileName && (
                <Pill tone="neutral">{draft.fileName}</Pill>
              )}
            </span>
          </Row>
          <Row label="Voice">
            {voice ? <span>{voice.name}</span> : "—"}
          </Row>
          <Row label="Language">{draft.language.toUpperCase()}</Row>
          <Row label="Run">
            <span className="flex flex-wrap gap-2">
              <Pill tone="orange">{draft.concurrency} concurrent</Pill>
              <Pill tone="neutral">{draft.max_attempts} attempts</Pill>
              <Pill tone="neutral">
                {draft.retry_delay_minutes} min retry delay
              </Pill>
            </span>
          </Row>
          <Row label="Retry on">
            {draft.retry_on.length ? (
              <span className="flex flex-wrap gap-1.5">
                {draft.retry_on.map((o) => (
                  <Pill key={o} tone="yellow">
                    {o.replace(/_/g, " ")}
                  </Pill>
                ))}
              </span>
            ) : (
              <span className="text-[#8a8a8a]">never retry</span>
            )}
          </Row>
          <Row label="Extraction">
            {draft.extraction_schema.length ? (
              <span className="flex flex-wrap gap-1.5">
                {draft.extraction_schema.map((f) => (
                  <Pill key={f.key} tone="blue">
                    {f.key}
                  </Pill>
                ))}
              </span>
            ) : (
              <span className="text-[#8a8a8a]">none</span>
            )}
          </Row>
        </CardBody>
      </Card>

      <TestCallCard draft={draft} />

      <p className="text-center text-xs text-[#8a8a8a]">
        On launch, the campaign starts immediately and you'll be taken to the
        live monitor.
      </p>
    </div>
  );
}
