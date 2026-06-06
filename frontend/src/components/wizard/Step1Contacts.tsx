import { useRef, useState } from "react";
import { Pill } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SAMPLE_CONTACTS, SAMPLE_FILE_NAME } from "./sampleContacts";
import type { StepProps } from "./types";

export function Step1Contacts({ draft, update }: StepProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mock "load": ignore whatever the user actually drops/picks and load the
  // canned BMW sample so the demo is deterministic.
  function loadSample() {
    update({ contacts: SAMPLE_CONTACTS, fileName: SAMPLE_FILE_NAME });
  }

  function clearFile() {
    update({ contacts: [], fileName: null });
  }

  const valid = draft.contacts.filter((c) => c.valid).length;
  const invalid = draft.contacts.length - valid;
  const hasFile = draft.fileName !== null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Contacts</h2>
        <p className="mt-1 text-sm text-[#8a8a8a]">
          Upload your customer list. Required columns:{" "}
          <code className="text-[#e0e0e0]">name</code>,{" "}
          <code className="text-[#e0e0e0]">phone</code>. Optional:{" "}
          <code className="text-[#e0e0e0]">context</code>,{" "}
          <code className="text-[#e0e0e0]">language</code>.
        </p>
      </div>

      {!hasFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            loadSample();
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging
              ? "border-[#F97316] bg-[#F97316]/5"
              : "border-[#212121] hover:border-[#F97316]/50 hover:bg-white/[0.02]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={() => loadSample()}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316]/15 text-2xl">
            ⬆
          </div>
          <p className="mt-3 text-sm font-medium text-[#e0e0e0]">
            Drop your <span className="text-white">.xlsx</span> or{" "}
            <span className="text-white">.csv</span> here
          </p>
          <p className="mt-1 text-xs text-[#8a8a8a]">
            or click to browse — we'll load a sample BMW recall list
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#212121] bg-[#0a0a0a] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-lg">📄</span>
              <div>
                <p className="text-sm font-medium text-white">
                  {draft.fileName}
                </p>
                <p className="text-xs text-[#8a8a8a]">
                  {draft.contacts.length} rows parsed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone="green">{valid} valid</Pill>
              {invalid > 0 && <Pill tone="red">{invalid} invalid</Pill>}
              <Button variant="ghost" size="sm" onClick={clearFile}>
                Replace
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-[#212121]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-[#8a8a8a]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Context</th>
                  <th className="px-4 py-2.5 font-medium">Lang</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {draft.contacts.map((c, i) => (
                  <tr
                    key={i}
                    className={`border-t border-[#212121] ${
                      c.valid ? "" : "bg-red-500/[0.04]"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-[#e0e0e0]">
                      {c.name || (
                        <span className="text-[#8a8a8a] italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#e0e0e0]">
                      {c.phone}
                    </td>
                    <td className="max-w-[18rem] truncate px-4 py-2.5 text-[#8a8a8a]">
                      {c.context}
                    </td>
                    <td className="px-4 py-2.5 text-[#8a8a8a]">
                      {c.language.toUpperCase()}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.valid ? (
                        <Pill tone="green">valid</Pill>
                      ) : (
                        <Pill tone="red">{c.error ?? "invalid"}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invalid > 0 && (
            <p className="text-xs text-[#8a8a8a]">
              {invalid} invalid row{invalid === 1 ? "" : "s"} will be skipped.{" "}
              {valid} contact{valid === 1 ? "" : "s"} will be called.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
