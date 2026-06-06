import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

type Tone = "danger" | "default";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body text or rich content explaining what will happen. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** Shows a spinner label and blocks interaction while the action runs. */
  loading?: boolean;
  /** Optional error to surface inside the dialog (keeps it open). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A soft, centered confirmation modal — the in-app replacement for
 * window.confirm()/alert(). Closes on Escape or backdrop click (unless loading).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
      if (e.key === "Enter" && !loading) onConfirm();
    }
    document.addEventListener("keydown", onKey);
    // focus the primary action so Enter/Space work immediately
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, loading, onCancel, onConfirm]);

  if (!open) return null;

  const danger = tone === "danger";

  return createPortal(
    <div
      className="rufen-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={() => !loading && onCancel()}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="rufen-modal w-full max-w-sm rounded-[14px] border border-border bg-card p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]"
      >
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted">{message}</div>

        {error && (
          <p className="mt-3 rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60 ${
              danger
                ? "bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-500/60 shadow-[0_0_20px_-6px_rgba(239,68,68,0.7)]"
                : "bg-primary text-white hover:bg-[#fb8634] focus-visible:ring-primary/60 shadow-[0_0_20px_-6px_rgba(249,115,22,0.7)]"
            }`}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
