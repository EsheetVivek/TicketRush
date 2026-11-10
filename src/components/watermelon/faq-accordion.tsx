"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus } from "lucide-react";

/** Adapted from Watermelon UI "faq-1": soft panels with an animated plus/minus and height transition. */
export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const base = useId();

  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => {
        const isOpen = open === i;
        const panel = `${base}-p${i}`;
        return (
          <li key={it.q} className="overflow-hidden rounded-2xl bg-card border-2 border-ink">
            <button type="button" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? null : i)}
              className="flex min-h-14 w-full items-center justify-between gap-4 px-5 text-left font-medium sm:px-6">
              {it.q}
              <motion.span aria-hidden animate={{ rotate: isOpen ? 45 : 0 }} transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sunk text-muted">
                <Plus className="size-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div id={panel} key="c" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.35 }}>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6">{it.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
