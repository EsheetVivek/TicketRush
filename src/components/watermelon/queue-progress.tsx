"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Adapted from Watermelon UI "labeled-progress-indicator": rotating status labels above a
 * progress bar with a moving sheen. Progress is real (0–100), not decorative.
 */
export function QueueProgress({ labels, progress, intervalMs = 2600 }: { labels: string[]; progress: number; intervalMs?: number }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (labels.length < 2 || reduce) return;
    const t = setInterval(() => setI((p) => (p + 1) % labels.length), intervalMs);
    return () => clearInterval(t);
  }, [labels.length, intervalMs, reduce]);
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="relative flex h-8 items-center perspective-[800px]" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={labels[i % labels.length]}
            initial={reduce ? false : { opacity: 0, y: 10, scale: 1.4, filter: "blur(4px)", rotateX: -60 }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", rotateX: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", rotateX: 90, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 600, damping: 100, mass: 10 }}
            className="origin-bottom text-lg font-semibold text-muted will-change-transform">
            {labels[i % labels.length]}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-line bg-sunk shadow-inner" role="progressbar"
        aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress through the line">
        <motion.div initial={false} animate={{ width: `${Math.max(pct, 3)}%` }} transition={{ duration: reduce ? 0 : 1, ease: "easeOut" }}
          className="relative h-full overflow-hidden rounded-full bg-hot">
          {!reduce && (
            <motion.div initial={{ x: "-100%" }} animate={{ x: "200%" }} transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-y-0 w-full bg-linear-to-r from-transparent via-white/45 to-transparent" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
