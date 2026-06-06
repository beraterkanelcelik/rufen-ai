import type { ReactNode } from "react";
import { Card, CardBody } from "../ui/Card";
import { Pill } from "../ui/Badge";
import { VOICES } from "./Step4Voice";
import type { StepProps } from "./types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2 text-sm">
      <span className="w-32 shrink-0 text-[#8a8a8a]">{label}</span>
      <span className="min-w-0 flex-1 text-[#e0e0e0]">{children}</span>
    </div>
  );
}

export function Step6Review({ draft }: StepProps) {
  const validContacts = draft.contacts.filter((c) => c.valid).length;
  const voice = VOICES.find((v) => v.id === draft.voice_id);

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
            {voice ? (
              <span>
                {voice.name}{" "}
                <span className="text-[#8a8a8a]">· {voice.accent}</span>
              </span>
            ) : (
              "—"
            )}
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

      <p className="text-center text-xs text-[#8a8a8a]">
        On launch, the campaign starts immediately and you'll be taken to the
        live monitor.
      </p>
    </div>
  );
}
