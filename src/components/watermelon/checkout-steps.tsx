"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Armchair, CreditCard, Lock, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = [
  { id: "queue", label: "Waiting room", icon: Users },
  { id: "select", label: "Pick seats", icon: Armchair },
  { id: "hold", label: "Seats held", icon: Lock },
  { id: "pay", label: "Pay", icon: CreditCard },
  { id: "tickets", label: "Tickets", icon: Ticket },
] as const;

export type CheckoutStep = (typeof ALL)[number]["id"];

/**
 * Adapted from Watermelon UI "step-indicator": segmented progress bar whose label morphs to the
 * current step. Shows real progress rather than appearing only on hover.
 */
export function CheckoutSteps({ current, withQueue = false, className }: { current: CheckoutStep; withQueue?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const steps = ALL.filter((s) => withQueue || s.id !== "queue");
  const index = Math.max(0, steps.findIndex((s) => s.id === current));
  const step = steps[index];
  const Icon = step.icon;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="relative h-7 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={step.id}
              initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="flex items-center gap-2 text-sm font-semibold">
              <Icon aria-hidden className="size-4" />{step.label}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted">Step {index + 1} of {steps.length}</span>
      </div>
      <ol className="mt-2 flex gap-1.5" aria-label="Checkout progress">
        {steps.map((s, i) => (
          <li key={s.id} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-sunk" aria-current={i === index ? "step" : undefined}>
            <span className="sr-only">{s.label}{i < index ? " (done)" : i === index ? " (current)" : ""}</span>
            <motion.span aria-hidden className={cn("absolute inset-y-0 left-0 rounded-full", i === index ? "bg-hot" : "bg-ink")}
              initial={false} animate={{ width: i <= index ? "100%" : "0%" }}
              transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5, delay: i === index ? 0.05 : 0 }} />
          </li>
        ))}
      </ol>
    </div>
  );
}
