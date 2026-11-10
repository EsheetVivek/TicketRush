"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * An issued ticket: QR on the main body, seat on a perforated stub that "tears" a little away when
 * the ticket first appears. Purely visual; the QR is the real signed ticket.
 */
export function TicketStub({ section, row, number, qr, index }: { section: string; row: string; number: number; qr: string; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 24, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: index % 2 ? 1 : -1 }}
      transition={{ type: "spring", bounce: 0.3, duration: 0.8, delay: index * 0.12 }}
      className="relative flex overflow-visible">
      <div className="min-w-0 flex-1 rounded-l-xl border-2 border-r-0 border-ink bg-card p-4 shadow-soft">
        <p className="eyebrow">{section}</p>
        <div className="mt-3 rounded-lg bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
          <img className="mx-auto w-40" src={qr} alt={`QR code for row ${row} seat ${number}`} width={160} height={160} />
        </div>
      </div>
      <motion.div initial={reduce ? false : { rotate: 0, x: 0 }} animate={reduce ? undefined : { rotate: 6, x: 8, y: 4 }}
        transition={{ type: "spring", stiffness: 160, damping: 12, delay: 0.5 + index * 0.12 }}
        style={{ transformOrigin: "0% 100%" }}
        className="relative flex w-24 shrink-0 flex-col justify-between rounded-r-xl border-2 border-dashed border-ink bg-acid p-3 text-acid-ink shadow-soft">
        <span aria-hidden className="absolute -left-[11px] -top-[11px] size-5 rounded-full border-2 border-ink bg-paper" />
        <span aria-hidden className="absolute -bottom-[11px] -left-[11px] size-5 rounded-full border-2 border-ink bg-paper" />
        <span className="font-mono text-[10px] font-bold uppercase">Admit one</span>
        <span><span className="block font-mono text-[10px] uppercase">Row</span><span className="display text-4xl leading-none">{row}</span></span>
        <span><span className="block font-mono text-[10px] uppercase">Seat</span><span className="display text-4xl leading-none">{number}</span></span>
      </motion.div>
    </motion.li>
  );
}
