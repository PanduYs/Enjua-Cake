"use client";

import { useState } from "react";

/** Copies text with the Clipboard API; announces the result to screen readers. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        window.setTimeout(() => setState("idle"), 2500);
      }}
      className="min-h-11 rounded-full border-2 border-primary px-4 text-sm font-semibold text-primary hover:bg-surface-muted"
    >
      <span aria-live="polite">{state === "copied" ? "Tersalin ✓" : state === "failed" ? "Gagal menyalin" : label}</span>
    </button>
  );
}
