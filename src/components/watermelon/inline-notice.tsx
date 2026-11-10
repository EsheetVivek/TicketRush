"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, Info } from "lucide-react";

/** Adapted from Watermelon UI "inline-toast": spring-animated status and error messages. */
export function InlineNotice({ message }: { message: { tone: "error" | "info"; text: string } | null }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {message && (
        <motion.p key={message.text} role={message.tone === "error" ? "alert" : "status"}
          initial={reduce ? false : { opacity: 0, y: 6, scale: 0.97, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97, filter: "blur(4px)" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className={`mt-4 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-sm ${message.tone === "error" ? "bg-hot-soft text-ink" : "bg-sunk text-muted"}`}>
          {message.tone === "error" ? <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-hot" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
          <span>{message.text}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}
