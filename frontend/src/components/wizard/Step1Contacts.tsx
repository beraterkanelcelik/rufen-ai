import { useRef, useState } from "react";
import { parseContacts } from "../../api";
import { Pill } from "../ui/Badge";
import { Button } from "../ui/Button";
import { FileIcon, UploadIcon } from "../ui/icons";
import type { StepProps } from "./types";

export function Step1Contacts({ draft, update }: StepProps) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Real upload: send the file to the backend importer, get valid/invalid rows.
  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await parseContacts(file);
      update({ contacts: res.contacts, fileName: res.fileName });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearFile() {
    update({ contacts: [], fileName: null });
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const valid = draft.contacts.filter((c) => c.valid).length;
  const invalid = draft.contacts.length - valid;
  const hasFile = draft.fileName !== null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Contacts</h2>
        <p className="mt-1 text-sm text-muted">
          Upload your customer list. Required columns:{" "}
          <code className="text-foreground">name</code>,{" "}
          <code className="text-foreground">phone</code>. Optional:{" "}
          <code className="text-foreground">context</code>,{" "}
          <code className="text-foreground">language</code>.
        </p>
      </div>

      {!hasFile ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed px-6 py-14 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-white/[0.02]"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UploadIcon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              {busy ? "Parsing…" : (
                <>
                  Drop your <span className="text-white">.xlsx</span> or{" "}
                  <span className="text-white">.csv</span> here
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              or click to choose a file (columns: name, phone, context, language)
            </p>
          </div>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-3">
              <FileIcon className="h-5 w-5 text-muted" />
              <div>
                <p className="text-sm font-medium text-white">
                  {draft.fileName}
                </p>
                <p className="text-xs text-muted">
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

          <div className="overflow-hidden rounded-[8px] border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-muted">
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
                    className={`border-t border-border ${
                      c.valid ? "" : "bg-red-500/[0.04]"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-foreground">
                      {c.name || (
                        <span className="text-muted italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                      {c.phone}
                    </td>
                    <td className="max-w-[18rem] truncate px-4 py-2.5 text-muted">
                      {c.context}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
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
            <p className="text-xs text-muted">
              {invalid} invalid row{invalid === 1 ? "" : "s"} will be skipped.{" "}
              {valid} contact{valid === 1 ? "" : "s"} will be called.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
