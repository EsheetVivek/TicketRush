"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { QrCode } from "lucide-react";

const ROWS = 7;
const COLS = 12;
type S = 0 | 1 | 2; // available, held, sold

function seed(): S[] {
  return Array.from({ length: ROWS * COLS }, (_, i) => ((i * 37) % 11 === 0 ? 2 : (i * 13) % 17 === 0 ? 1 : 0) as S);
}

/** Decorative hero ticket: a live mini seat map on the ticket body and a tear-off stub. */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const [seats, setSeats] = useState<S[]>(seed);
  const [left, setLeft] = useState(582); // seconds on the hold timer
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
      setLeft((s) => (s <= 1 ? 600 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div aria-hidden className="relative mx-auto w-full max-w-lg">
      <motion.div initial={reduce ? false : { opacity: 0, y: 30, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: -3 }}
        transition={{ type: "spring", bounce: 0.3, duration: 1 }}
        className="relative flex overflow-hidden rounded-xl border-2 border-ink bg-card shadow-[8px_8px_0_var(--ink)]">
        {/* Ticket body */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-hot/70 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-hot" /></span>
              Live drop
            </span>
            <span className="truncate font-mono text-[11px] text-muted">Monsoon Beats Live</span>
          </div>
          <p className="display mt-3 text-3xl leading-none">Admit two</p>
          <div className="mt-3 rounded-md bg-ink py-1 text-center font-mono text-[9px] uppercase tracking-[0.4em] text-paper">Stage</div>
          <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
            {seats.map((s, i) => {
              const isMine = mine.includes(i);
              return (
                <motion.span key={i}
                  animate={{ scale: isMine ? [1, 1.2, 1] : 1 }}
                  transition={isMine && !reduce ? { duration: 1.4, repeat: Infinity, repeatDelay: 1 } : { duration: 0 }}
                  className={`aspect-square rounded-[3px] border transition-colors duration-500 ${isMine ? "border-ink bg-hot" : s === 2 ? "seat-sold border-transparent" : s === 1 ? "seat-held border-muted/40" : "border-muted/50 bg-card"}`} />
              );
            })}
          </div>
        </div>
        {/* Perforation + stub */}
        <div className="relative w-28 shrink-0 border-l-2 border-dashed border-ink bg-acid p-3 text-acid-ink sm:w-32">
          <span className="absolute -left-[11px] -top-[11px] size-5 rounded-full border-2 border-ink bg-paper" />
          <span className="absolute -bottom-[11px] -left-[11px] size-5 rounded-full border-2 border-ink bg-paper" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider">Held for you</p>
          <p className="display mt-1 text-4xl tabular-nums leading-none">{mm}:{ss}</p>
          <p className="mt-3 font-mono text-[10px] uppercase">Gold · F12 F13</p>
          <QrCode className="mt-3 size-12" strokeWidth={1.5} />
        </div>
      </motion.div>
    </div>
  );
}
