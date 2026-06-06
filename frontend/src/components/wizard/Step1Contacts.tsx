import { useRef, useState } from "react";
import { parseContacts } from "../../api";
import { Pill } from "../ui/Badge";
import { Button } from "../ui/Button";
import { FileIcon, TrashIcon, UploadIcon } from "../ui/icons";
import type { Language } from "../../types";
import type { DraftContact, StepProps } from "./types";

const inp =
  "w-full rounded-[6px] border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder-subtle focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20";

function validate(c: { name: string; phone: string }): { valid: boolean; error?: string } {
  if (!c.name.trim()) return { valid: false, error: "Missing name" };
  if (!/^\+\d{6,15}$/.test(c.phone.trim())) return { valid: false, error: "Invalid phone (E.164)" };
  return { valid: true };
}

export function Step1Contacts({ draft, update }: StepProps) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function updateRow(i: number, patch: Partial<DraftContact>) {
    const next = draft.contacts.map((c, idx) => {
      if (idx !== i) return c;
      const merged = { ...c, ...patch };
      const v = validate(merged);
      return { ...merged, valid: v.valid, error: v.error };
    });
    update({ contacts: next });
  }

  function deleteRow(i: number) {
    update({ contacts: draft.contacts.filter((_, idx) => idx !== i) });
  }

  function addRow() {
    const blank: DraftContact = {
      name: "", phone: "", context: "", language: "en", valid: false, error: "Missing name",
    };
    update({ contacts: [...draft.contacts, blank], fileName: draft.fileName ?? "Manual list" });
  }

  const valid = draft.contacts.filter((c) => c.valid).length;
  const invalid = draft.contacts.length - valid;
  const hasFile = draft.fileName !== null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Contacts</h2>
        <p className="mt-1 text-sm text-muted">
          Upload your customer list, then edit any row. Required:{" "}
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
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
                <>Drop your <span className="text-white">.xlsx</span> or <span className="text-white">.csv</span> here</>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              or click to choose a file (columns: name, phone, context, language)
            </p>
          </div>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          <p className="mt-3 text-center text-xs text-muted">
            or{" "}
            <button type="button" onClick={addRow} className="text-primary hover:underline">
              enter contacts manually
            </button>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-3">
              <FileIcon className="h-5 w-5 text-muted" />
              <div>
                <p className="text-sm font-medium text-white">{draft.fileName}</p>
                <p className="text-xs text-muted">{draft.contacts.length} rows · editable</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone="green">{valid} valid</Pill>
              {invalid > 0 && <Pill tone="red">{invalid} invalid</Pill>}
              <Button variant="ghost" size="sm" onClick={clearFile}>Replace</Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Context</th>
                  <th className="px-3 py-2.5 font-medium">Lang</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {draft.contacts.map((c, i) => (
                  <tr key={i} className={`border-t border-border ${c.valid ? "" : "bg-red-500/[0.04]"}`}>
                    <td className="px-2 py-2">
                      <input className={inp} value={c.name} placeholder="Full name"
                        onChange={(e) => updateRow(i, { name: e.target.value })} />
                    </td>
                    <td className="px-2 py-2 w-44">
                      <input className={`${inp} font-mono text-xs`} value={c.phone} placeholder="+49…"
                        onChange={(e) => updateRow(i, { phone: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inp} value={c.context} placeholder="vehicle / VIN / plate…"
                        onChange={(e) => updateRow(i, { context: e.target.value })} />
                    </td>
                    <td className="px-2 py-2 w-20">
                      <select className={inp} value={c.language}
                        onChange={(e) => updateRow(i, { language: e.target.value as Language })}>
                        <option value="en">EN</option>
                        <option value="de">DE</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      {c.valid ? <Pill tone="green">valid</Pill> : <Pill tone="red">{c.error ?? "invalid"}</Pill>}
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" aria-label="Delete contact" title="Delete contact"
                        onClick={() => deleteRow(i)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-subtle transition-colors hover:bg-red-500/10 hover:text-red-400">
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={addRow}>+ Add contact</Button>
            {invalid > 0 && (
              <p className="text-xs text-muted">
                {invalid} invalid row{invalid === 1 ? "" : "s"} will be skipped · {valid} will be called.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
