"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { PayPanel } from "@/components/pay-panel";

type Status = "available" | "held" | "sold";
interface Seat { id: string; section: string; row: string; number: number; priceCents: number; status: Status }
interface Hold { holdToken: string; seatIds: string[]; expiresAt: string }

const MAX = 6;
const POLL_MS = 3000;

export function SeatPicker({ eventId, signedIn }: { eventId: string; signedIn: boolean }) {
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Polls use the edge-cached snapshot (2 s); right after our own hold or release we bypass it.
  const loadSeats = useCallback(async (fresh = false) => {
    const r = await fetch(`/api/events/${eventId}/seats${fresh ? `?fresh=${Date.now()}` : ""}`, fresh ? { cache: "no-store" } : undefined);
    if (r.ok) setSeats((await r.json()).seats);
  }, [eventId]);

  const loadHold = useCallback(async () => {
    if (!signedIn) return;
    const r = await fetch(`/api/holds?eventId=${eventId}`);
    if (r.ok) setHold((await r.json()).hold);
  }, [eventId, signedIn]);

  // Poll availability; first load runs on the next tick so state updates come from a callback.
  useEffect(() => {
    const first = setTimeout(() => { void loadSeats(); void loadHold(); }, 0);
    const t = setInterval(() => void loadSeats(), POLL_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [loadSeats, loadHold]);

  // Hold countdown; releases the hold in the UI when it expires.
  useEffect(() => {
    if (!hold) return;
    const expires = new Date(hold.expiresAt).getTime();
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= expires) {
        setHold(null);
        setMessage({ tone: "info", text: "Your hold expired and the seats were released." });
        void loadSeats();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [hold, loadSeats]);

  const mine = useMemo(() => new Set(hold?.seatIds ?? []), [hold]);
  const byId = useMemo(() => new Map((seats ?? []).map((s) => [s.id, s])), [seats]);
  const sections = useMemo(() => {
    const m = new Map<string, Map<string, Seat[]>>();
    for (const s of seats ?? []) {
      if (!m.has(s.section)) m.set(s.section, new Map());
      const rows = m.get(s.section)!;
      if (!rows.has(s.row)) rows.set(s.row, []);
      rows.get(s.row)!.push(s);
    }
    return [...m.entries()];
  }, [seats]);

  const remainingS = hold ? Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - now) / 1000)) : 0;

  function toggle(id: string) {
    setMessage(null);
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX) {
        setMessage({ tone: "info", text: `You can choose up to ${MAX} seats per order.` });
        return cur;
      }
      return [...cur, id];
    });
  }

  async function holdSeats() {
    setBusy(true);
    setMessage(null);
    // Optimistic: show the seats as yours straight away; roll back if the server says no.
    const wanted = selected;
    const optimisticExpiry = new Date(Date.now() + 10 * 60_000).toISOString();
    setHold({ holdToken: "pending", seatIds: wanted, expiresAt: optimisticExpiry });
    setSelected([]);
    try {
      const r = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, seatIds: selected }),
      });
      const body = await r.json();
      if (r.ok) {
        setHold({ ...body.hold, expiresAt: body.hold.expiresAt });
        setNow(Date.now());
      } else {
        setHold(null);
        setMessage({ tone: "error", text: body.error ?? "Couldn't hold those seats. Try again." });
        setSelected(body.seatIds?.length ? wanted.filter((id) => !body.seatIds.includes(id)) : wanted);
      }
      // Refresh availability now rather than waiting for the next poll.
      void loadSeats(true);
    } catch {
      setHold(null);
      setSelected(wanted);
      setMessage({ tone: "error", text: "Network problem. Nothing was held, so try again." });
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      setHold(null); // optimistic
      setMessage({ tone: "info", text: "Seats released." });
      await fetch(`/api/holds?eventId=${eventId}`, { method: "DELETE" });
      void loadSeats(true);
    } finally {
      setBusy(false);
    }
  }

  const selectedTotal = selected.reduce((sum, id) => sum + (byId.get(id)?.priceCents ?? 0), 0);
  const holdTotal = (hold?.seatIds ?? []).reduce((sum, id) => sum + (byId.get(id)?.priceCents ?? 0), 0);
  const label = (s: Seat) => `${s.section}, row ${s.row}, seat ${s.number}`;

  if (!seats) {
    return <div className="card mt-8 h-72 animate-pulse" aria-label="Loading seats" />;
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <section aria-label="Seat map" className="card min-w-0 p-4 sm:p-8">
        <div className="mx-auto mb-8 max-w-md rounded-full bg-sunk py-2 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Stage</div>
        <div className="flex flex-col gap-8">
          {sections.map(([name, rows]) => {
            const first = [...rows.values()][0][0];
            return (
              <fieldset key={name} className="min-w-0">
                <legend className="mb-3 flex w-full items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="text-sm tabular-nums text-muted">{money(first.priceCents)}</span>
                </legend>
                <div className="-mx-1 overflow-x-auto px-1 pb-2">
                  <div className="flex w-max min-w-full flex-col items-center gap-1.5">
                    {[...rows.entries()].map(([row, rowSeats]) => (
                      <div key={row} className="flex items-center gap-1.5">
                        <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted" aria-hidden>{row}</span>
                        {rowSeats.map((s) => {
                          const isMine = mine.has(s.id);
                          const isSel = selected.includes(s.id);
                          const disabled = !isMine && s.status !== "available";
                          const cls = isMine
                            ? "bg-ink border-ink text-paper"
                            : isSel
                              ? "bg-hot border-hot text-hot-ink"
                              : s.status === "sold"
                                ? "seat-sold border-transparent text-transparent cursor-not-allowed"
                                : s.status === "held"
                                  ? "seat-held border-line text-transparent cursor-not-allowed"
                                  : "bg-card border-line-strong text-muted hover:border-ink hover:text-ink";
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={disabled || isMine || !!hold}
                              aria-pressed={isSel}
                              aria-label={`${label(s)}, ${money(s.priceCents)}, ${isMine ? "held by you" : s.status}`}
                              title={`${label(s)} · ${money(s.priceCents)}`}
                              onClick={() => toggle(s.id)}
                              className={`h-7 w-7 shrink-0 rounded-full border text-[10px] font-medium tabular-nums transition-colors duration-100 ${cls}`}
                            >
                              {s.number}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className="mt-8 border-t border-line pt-4"><Legend /></div>
      </section>

      <aside className="sticky bottom-4 z-10 lg:bottom-auto lg:top-8 lg:self-start">
        <div className="card p-4 shadow-lg shadow-black/5 sm:p-6 lg:shadow-soft">
          {hold ? (
            <>
              <p className="eyebrow">Held for you</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight" aria-live="polite">
                {Math.floor(remainingS / 60)}:{String(remainingS % 60).padStart(2, "0")}
              </p>
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                {hold.seatIds.map((id) => byId.get(id)).filter(Boolean).map((s) => (
                  <li key={s!.id} className="flex justify-between gap-2"><span>{label(s!)}</span><span className="tabular-nums text-muted">{money(s!.priceCents)}</span></li>
                ))}
              </ul>
              <div className="stub-rule mt-4 flex justify-between pt-4 text-sm font-semibold"><span>Total</span><span className="tabular-nums">{money(holdTotal)}</span></div>
              {hold.holdToken === "pending"
                ? <PendingButton label="Holding your seats…" />
                : <PayPanel eventId={eventId} holdToken={hold.holdToken} />}
              <button type="button" onClick={release} disabled={busy} className="btn-quiet mt-2 w-full">Release seats</button>
            </>
          ) : (
            <>
              <p className="eyebrow hidden lg:block">Your selection</p>
              {selected.length === 0 ? (
                <p className="mt-3 hidden text-sm text-muted lg:block">Pick up to {MAX} seats on the map. We&apos;ll hold them for 10 minutes while you pay.</p>
              ) : (
                <ul className="mt-3 hidden flex-col gap-1 text-sm lg:flex">
                  {selected.map((id) => byId.get(id)).filter(Boolean).map((s) => (
                    <li key={s!.id} className="flex justify-between gap-2"><span>{label(s!)}</span><span className="tabular-nums text-muted">{money(s!.priceCents)}</span></li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between text-sm font-semibold lg:stub-rule lg:mt-4 lg:pt-4"><span>Total{selected.length ? ` · ${selected.length} seat${selected.length === 1 ? "" : "s"}` : ""}</span><span className="tabular-nums">{money(selectedTotal)}</span></div>
              {signedIn ? (
                <button type="button" onClick={holdSeats} disabled={busy || selected.length === 0} className="btn-primary mt-4 w-full">
                  {selected.length ? `Hold ${selected.length} seat${selected.length === 1 ? "" : "s"}` : "Choose seats to hold"}
                </button>
              ) : (
                <a href={`/signin?callbackUrl=/events/${eventId}`} className="btn-primary mt-4 w-full">Sign in to hold seats</a>
              )}
            </>
          )}
          {message && (
            <p role={message.tone === "error" ? "alert" : "status"}
              className={`mt-4 rounded-xl px-3 py-2 text-sm ${message.tone === "error" ? "bg-hot-soft text-ink" : "bg-sunk text-muted"}`}>
              {message.text}
            </p>
          )}
        </div>
        <p className="mt-3 hidden px-1 text-xs text-muted lg:block">Availability refreshes every few seconds. A seat can only ever be held by one person.</p>
      </aside>
    </div>
  );
}

export function PendingButton({ label }: { label: string }) {
  return (
    <button type="button" disabled aria-busy="true" className="btn-primary mt-4 w-full">
      <span aria-hidden className="spinner" />{label}
    </button>
  );
}

function Legend() {
  const item = (cls: string, text: string) => (
    <li className="flex items-center gap-2"><span aria-hidden className={`h-4 w-4 rounded-full border ${cls}`} />{text}</li>
  );
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted" aria-label="Seat legend">
      {item("bg-card border-line-strong", "Available")}
      {item("bg-hot border-hot", "Selected")}
      {item("bg-ink border-ink", "Held by you")}
      {item("seat-held border-line", "Held by someone else")}
      {item("seat-sold border-transparent", "Sold")}
    </ul>
  );
}
