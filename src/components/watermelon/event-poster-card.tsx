"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarDays, MapPin, Ticket, Users, X } from "lucide-react";
import { money, when } from "@/lib/format";

export interface PosterEvent {
  id: string; title: string; venue: string; startsAt: string; total: number; sold: number; fromCents: number; queue: boolean;
}

/** Deterministic poster palette per event, so each event keeps its own look. */
function palette(id: string) {
  // FNV-1a with a final avalanche, so IDs that differ in one character still get distant hues.
  let h = 0x811c9dc5;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b) >>> 0; h ^= h >>> 16;
  const base = h % 360;
  return { a: `oklch(0.62 0.17 ${base})`, b: `oklch(0.45 0.15 ${(base + 40) % 360})`, c: `oklch(0.82 0.12 ${(base + 320) % 360})` };
}

function Poster({ e, big = false }: { e: PosterEvent; big?: boolean }) {
  const p = palette(e.id);
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${p.a}, ${p.b})` }}>
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice">
        <circle cx="320" cy="40" r="110" fill={p.c} opacity="0.35" />
        <circle cx="60" cy="230" r="140" fill="#000" opacity="0.18" />
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={24 + i * 40} y={150 - (i % 3) * 18} width="22" height={90 + (i % 4) * 12} rx="11" fill="#fff" opacity={0.08 + (i % 3) * 0.04} />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent p-4 sm:p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/80">{when(new Date(e.startsAt))}</p>
        {big && <p className="mt-1 text-sm text-white/85">{e.venue}</p>}
      </div>
    </div>
  );
}

/**
 * Adapted from Watermelon UI "expandable-event-card": a poster card that expands into a
 * detail view with a shared-layout animation. Escape, the close button or the backdrop close it.
 */
export function EventPosterCard({ e }: { e: PosterEvent }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const id = `event-${e.id}`;
  const left = e.total - e.sold;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, bounce: 0.12, duration: 0.5 };

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const opener = openerRef.current;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <motion.button ref={openerRef} type="button" layoutId={id} transition={spring} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-label={`${e.title}, ${when(new Date(e.startsAt))}. Show details`}
        className="group flex h-full w-full flex-col overflow-hidden rounded-3xl bg-card text-left shadow-soft ring-1 ring-line transition-shadow hover:shadow-lg">
        <motion.div layoutId={`${id}-poster`} transition={spring} className="h-44 w-full overflow-hidden sm:h-52">
          <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"><Poster e={e} /></div>
        </motion.div>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <motion.h3 layoutId={`${id}-title`} transition={spring} className="text-lg font-semibold tracking-tight">{e.title}</motion.h3>
            <span className="badge shrink-0 bg-sunk text-ink">{left === 0 ? "Sold out" : e.queue ? "Waiting room" : "On sale"}</span>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted"><MapPin aria-hidden className="size-3.5" />{e.venue}</p>
          <div aria-hidden className="stub-rule mt-auto" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">From <span className="font-semibold text-ink">{money(e.fromCents)}</span></span>
            <span className="font-mono text-xs tabular-nums text-muted">{left} of {e.total} left</span>
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-8">
            <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}
              className="absolute inset-0 bg-paper/75 backdrop-blur-md" />
            <motion.div role="dialog" aria-modal="true" aria-labelledby={`${id}-dlg-title`} layoutId={id} transition={spring}
              className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-line">
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close details"
                className="absolute right-3 top-3 z-20 flex size-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/45">
                <X aria-hidden className="size-4" />
              </button>
              <motion.div layoutId={`${id}-poster`} transition={spring} className="h-52 w-full shrink-0 overflow-hidden sm:h-72">
                <Poster e={e} big />
              </motion.div>
              <div className="overflow-y-auto p-6 sm:p-8">
                <motion.h3 id={`${id}-dlg-title`} layoutId={`${id}-title`} transition={spring} className="text-2xl font-semibold tracking-tight sm:text-3xl">{e.title}</motion.h3>
                <motion.div initial={reduce ? false : { opacity: 0, y: 16, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.35, delay: reduce ? 0 : 0.1 }}>
                  <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                    <div className="flex gap-3"><CalendarDays aria-hidden className="mt-0.5 size-4 text-muted" /><div><dt className="text-muted">When</dt><dd className="font-medium">{when(new Date(e.startsAt))}</dd></div></div>
                    <div className="flex gap-3"><MapPin aria-hidden className="mt-0.5 size-4 text-muted" /><div><dt className="text-muted">Where</dt><dd className="font-medium">{e.venue}</dd></div></div>
                    <div className="flex gap-3"><Ticket aria-hidden className="mt-0.5 size-4 text-muted" /><div><dt className="text-muted">Tickets</dt><dd className="font-medium">From {money(e.fromCents)} · {left} of {e.total} left</dd></div></div>
                    <div className="flex gap-3"><Users aria-hidden className="mt-0.5 size-4 text-muted" /><div><dt className="text-muted">Entry</dt><dd className="font-medium">{e.queue ? "Waiting room, first come first served" : "Straight to seat selection"}</dd></div></div>
                  </dl>
                  <p className="mt-6 text-sm leading-relaxed text-muted">
                    Pick up to 6 seats and they&apos;re held for you for 10 minutes while you pay. Payments run in test mode, and if tickets can&apos;t be issued you&apos;re refunded automatically.
                  </p>
                  <Link href={`/events/${e.id}`} className="btn-primary mt-6 w-full px-6 sm:w-auto">
                    {left === 0 ? "See the seat map" : "Choose seats"}<ArrowRight aria-hidden className="size-4" />
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
