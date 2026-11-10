"use client";

import { useState } from "react";

/** Shows a shortened payment reference; the button copies the full value. */
export function CopyRef({ value, short }: { value: string; short: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the full value is still in the title */ }
  }
  return (
    <button type="button" onClick={copy} title={value} aria-label={`Copy payment reference ${value}`}
      className="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-mono text-xs text-muted transition-colors hover:bg-sunk hover:text-ink">
      <span>{short}</span>
      <span aria-live="polite" className="text-[11px] font-sans">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
