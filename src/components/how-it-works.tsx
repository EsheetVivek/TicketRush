"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CreditCard, Lock, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Users, title: "Join the line", body: "For a big drop you get a place in a first-come, first-served waiting room. Refreshing never loses your spot, and you're let in at a steady rate." },
  { icon: Lock, title: "Hold your seats", body: "Pick up to 6 seats. They're held for you alone for 10 minutes, all of them or none, so nobody else can take them while you pay." },
  { icon: CreditCard, title: "Pay", body: "The price is read from our database, never from your browser. A double click or a flaky network can't charge you twice." },
  { icon: Ticket, title: "Get QR tickets", body: "Tickets are issued the moment payment is confirmed. Each QR code is signed and works once. If they can't be issued, you're refunded automatically." },
];

/**
 * Interactive four-step explainer using the Watermelon "step-indicator" pattern: a segmented bar
 * you can hover, focus or tap, with the step's content morphing in. Auto-advances until touched.
 */
export function HowItWorks() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4000);
    return () => clearInterval(t);
  }, [touched, reduce]);

  const pick = (i: number) => { setTouched(true); setActive(i); };
  const S = STEPS[active];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
      <ol className="flex flex-col gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button type="button" onMouseEnter={() => pick(i)} onFocus={() => pick(i)} onClick={() => pick(i)} aria-pressed={i === active}
              className={cn("relative flex min-h-14 w-full items-center gap-4 rounded-2xl px-4 text-left transition-colors", i === active ? "text-ink" : "text-muted hover:text-ink")}>
              {i === active && (
                <motion.span layoutId="hiw-active" aria-hidden transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.4 }}
                  className="absolute inset-0 rounded-2xl bg-card shadow-soft ring-1 ring-line" />
              )}
              <span className={cn("relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-xs transition-colors", i === active ? "bg-ink text-paper" : "bg-sunk")}>{i + 1}</span>
              <span className="relative z-10 font-medium">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl bg-card p-6 shadow-soft ring-1 ring-line sm:p-8">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.title} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
              <motion.span className={cn("absolute inset-y-0 left-0 rounded-full", i === active ? "bg-hot" : "bg-ink")} initial={false}
                animate={{ width: i <= active ? "100%" : "0%" }} transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5 }} />
            </span>
          ))}
        </div>
        <div className="relative mt-8 min-h-44" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={active}
              initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(6px)" }} transition={{ type: "spring", bounce: 0, duration: 0.45 }}>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-hot-soft text-hot"><S.icon aria-hidden className="size-5" /></span>
              <p className="mt-5 font-mono text-xs text-muted">Step {active + 1} of {STEPS.length}</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">{S.title}</h3>
              <p className="mt-3 max-w-prose leading-relaxed text-muted">{S.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
