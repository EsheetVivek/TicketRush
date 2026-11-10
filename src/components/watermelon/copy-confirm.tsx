"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy } from "lucide-react";

/** Adapted from Watermelon UI "copy-confirm": compact copy pill with a morphing icon and label. */
export function CopyConfirm({ value, display, label = "Copy" }: { value: string; display?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the value stays selectable */
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <code className="select-all rounded-md bg-sunk px-2 py-1 font-mono text-xs text-ink">{display ?? value}</code>
      <motion.button type="button" onClick={copy} whileTap={reduce ? undefined : { scale: 0.94 }}
        aria-label={copied ? "Copied" : `${label} ${value}`}
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${copied ? "text-ok" : "text-muted hover:bg-sunk hover:text-ink"}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={copied ? "y" : "n"}
            initial={reduce ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          </motion.span>
        </AnimatePresence>
        <span className="hidden sm:inline" aria-hidden>{copied ? "Copied" : label}</span>
      </motion.button>
    </span>
  );
}
