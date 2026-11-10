"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Lock, QrCode } from "lucide-react";

const ROWS = 7;
const COLS = 12;
type S = 0 | 1 | 2; // available, held, sold

function seed(): S[] {
  return Array.from({ length: ROWS * COLS }, (_, i) => ((i * 37) % 11 === 0 ? 2 : (i * 13) % 17 === 0 ? 1 : 0) as S);
}

/** Decorative "live drop" mini seat map. Seats fill up over time; a few are held by "you". */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const [seats, setSeats] = useState<S[]>(seed);
  const mine = [3 * COLS + 5, 3 * COLS + 6];

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setSeats((cur) => {
        const next = [...cur];
        for (let k = 0; k < 3; k++) {
          const i = Math.floor(Math.random() * next.length);
          if (mine.includes(i)) continue;
          next[i] = next[i] === 0 ? 1 : next[i] === 1 ? 2 : next.filter((x) => x === 2).length > 60 ? 0 : 2;
        }
        return next;
      });
    }, 900);
    return () => clearInterval(t);
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <motion.div initial={reduce ? false : { opacity: 0, y: 24, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.9 }}
        className="rounded-3xl bg-card p-5 shadow-2xl shadow-black/10 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-hot/60 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-hot" /></span>Live drop</span>
          <span className="font-mono text-[11px] text-muted">Monsoon Beats Live</span>
        </div>
        <div className="mt-4 rounded-xl bg-sunk py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted">Stage</div>
        <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {seats.map((s, i) => {
            const isMine = mine.includes(i);
            return (
              <motion.span key={i} layout={false}
                animate={{ scale: isMine ? [1, 1.15, 1] : 1 }}
                transition={isMine && !reduce ? { duration: 1.6, repeat: Infinity, repeatDelay: 1.2 } : { duration: 0 }}
                className={`aspect-square rounded-full border transition-colors duration-500 ${isMine ? "border-hot bg-hot" : s === 2 ? "seat-sold border-transparent" : s === 1 ? "seat-held border-line" : "border-line-strong bg-card"}`} />
            );
          })}
        </div>
      </motion.div>

      <motion.div initial={reduce ? false : { opacity: 0, x: 24, y: 12 }} animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ type: "spring", bounce: 0.25, duration: 0.9, delay: 0.25 }}
        className="pill-surface absolute -bottom-6 -left-2 flex items-center gap-3 rounded-2xl px-4 py-3 sm:-left-8">
        <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper"><Lock className="size-4" /></span>
        <span><span className="block text-xs text-muted">Held for you</span><span className="font-mono text-sm font-semibold tabular-nums">9:42</span></span>
      </motion.div>

      <motion.div initial={reduce ? false : { opacity: 0, x: -24, y: -12 }} animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ type: "spring", bounce: 0.25, duration: 0.9, delay: 0.45 }}
        className="absolute -right-2 -top-14 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-lg ring-1 ring-line sm:-right-8">
        <QrCode className="size-8 text-ink" />
        <span><span className="block text-xs text-muted">Gold · F12, F13</span><span className="text-sm font-semibold">Ticketed</span></span>
      </motion.div>
    </div>
  );
}
