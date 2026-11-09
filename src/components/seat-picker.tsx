"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";

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

  const loadSeats = useCallback(async () => {
    const r = await fetch(`/api/events/${eventId}/seats`);
    if (r.ok) setSeats((await r.json()).seats);
  }, [eventId]);

  const loadHold = useCallback(async () => {
    if (!signedIn) return;
    const r = await fetch(`/api/holds?eventId=${eventId}`);
    if (r.ok) setHold((await r.json()).hold);
  }, [eventId, signedIn]);

  useEffect(() => {
    loadSeats();
    loadHold();
    const t = setInterval(loadSeats, POLL_MS);
    return () => clearInterval(t);
  }, [loadSeats, loadHold]);

  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hold]);

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
  useEffect(() => {
    if (hold && remainingS === 0) {
      setHold(null);
      setMessage({ tone: "info", text: "Your hold expired and the seats were released." });
      loadSeats();
    }
  }, [hold, remainingS, loadSeats]);

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
    try {
      const r = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, seatIds: selected }),
      });
      const body = await r.json();
      if (r.ok) {
        setHold({ ...body.hold, expiresAt: body.hold.expiresAt });
        setSelected([]);
        setNow(Date.now());
      } else {
        setMessage({ tone: "error", text: body.error ?? "Couldn't hold those seats. Try again." });
        if (body.seatIds?.length) setSelected((cur) => cur.filter((id) => !body.seatIds.includes(id)));
      }
      await loadSeats();
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      await fetch(`/api/holds?eventId=${eventId}`, { method: "DELETE" });
      setHold(null);
      setMessage({ tone: "info", text: "Seats released." });
      await loadSeats();
    } finally {
      setBusy(false);
    }
  }

  const selectedTotal = selected.reduce((sum, id) => sum + (byId.get(id)?.priceCents ?? 0), 0);
  const holdTotal = (hold?.seatIds ?? []).reduce((sum, id) => sum + (byId.get(id)?.priceCents ?? 0), 0);
  const label = (s: Seat) => `${s.section}, row ${s.row}, seat ${s.number}`;

  if (!seats) {
    return <div className="mt-10 h-72 animate-pulse rounded-2xl border border-line bg-card" aria-label="Loading seats" />;
  }

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="Seat map" className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-6">
        <div className="mb-6 rounded-lg bg-paper py-2 text-center font-mono text-xs uppercase tracking-[0.3em] text-muted">Stage</div>
        <Legend />
        <div className="mt-6 flex flex-col gap-8">
          {sections.map(([name, rows]) => {
            const first = [...rows.values()][0][0];
            return (
              <fieldset key={name} className="min-w-0">
                <legend className="mb-3 flex w-full items-baseline justify-between gap-3">
                  <span className="text-lg font-semibold">{name}</span>
                  <span className="text-sm text-muted">{money(first.priceCents)}</span>
                </legend>
                <div className="overflow-x-auto pb-2">
                  <div className="flex w-max flex-col gap-1.5">
                    {[...rows.entries()].map(([row, rowSeats]) => (
                      <div key={row} className="flex items-center gap-1.5">
                        <span className="w-5 shrink-0 text-center font-mono text-xs text-muted" aria-hidden>{row}</span>
                        {rowSeats.map((s) => {
                          const isMine = mine.has(s.id);
                          const isSel = selected.includes(s.id);
                          const disabled = !isMine && s.status !== "available";
                          const cls = isMine
                            ? "bg-ok text-white border-ok"
                            : isSel
                              ? "bg-hot text-hot-ink border-hot"
                              : s.status === "sold"
                                ? "bg-sold border-sold text-transparent cursor-not-allowed"
                                : s.status === "held"
                                  ? "bg-held/30 border-held text-transparent cursor-not-allowed"
                                  : "bg-card border-line hover:border-hot hover:text-hot";
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={disabled || isMine || !!hold}
                              aria-pressed={isSel}
                              aria-label={`${label(s)}, ${money(s.priceCents)}, ${isMine ? "held by you" : s.status}`}
                              title={`${label(s)} · ${money(s.priceCents)}`}
                              onClick={() => toggle(s.id)}
                              className={`h-7 w-7 shrink-0 rounded-md border text-[10px] font-medium tabular-nums transition ${cls}`}
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
      </section>

      <aside className="sticky bottom-3 z-10 lg:bottom-auto lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-line bg-card p-4 shadow-xl lg:p-5 shadow-black/10 lg:shadow-none">
          {hold ? (
            <>
              <p className="font-mono text-xs uppercase tracking-widest text-muted">Held for you</p>
              <p className="mt-2 text-4xl font-bold tabular-nums" aria-live="polite">
                {Math.floor(remainingS / 60)}:{String(remainingS % 60).padStart(2, "0")}
              </p>
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                {hold.seatIds.map((id) => byId.get(id)).filter(Boolean).map((s) => (
                  <li key={s!.id} className="flex justify-between gap-2"><span>{label(s!)}</span><span className="text-muted">{money(s!.priceCents)}</span></li>
                ))}
              </ul>
              <div className="mt-4 flex justify-between border-t border-line pt-4 font-semibold"><span>Total</span><span>{money(holdTotal)}</span></div>
              <button type="button" disabled className="mt-4 min-h-11 w-full rounded-full bg-ink font-semibold text-paper opacity-50">Pay (coming in milestone 3)</button>
              <button type="button" onClick={release} disabled={busy} className="mt-2 min-h-11 w-full rounded-full border border-line font-medium hover:bg-paper">Release seats</button>
            </>
          ) : (
            <>
              <p className="hidden font-mono text-xs uppercase tracking-widest text-muted lg:block">Your selection</p>
              {selected.length === 0 ? (
                <p className="mt-3 hidden text-sm text-muted lg:block">Pick up to {MAX} seats on the map. We&apos;ll hold them for 10 minutes while you pay.</p>
              ) : (
                <ul className="mt-3 hidden flex-col gap-1 text-sm lg:flex">
                  {selected.map((id) => byId.get(id)).filter(Boolean).map((s) => (
                    <li key={s!.id} className="flex justify-between gap-2"><span>{label(s!)}</span><span className="text-muted">{money(s!.priceCents)}</span></li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between font-semibold lg:mt-4 lg:border-t lg:border-line lg:pt-4"><span>Total{selected.length ? ` · ${selected.length} seat${selected.length === 1 ? "" : "s"}` : ""}</span><span>{money(selectedTotal)}</span></div>
              {signedIn ? (
                <button type="button" onClick={holdSeats} disabled={busy || selected.length === 0}
                  className="mt-3 min-h-11 w-full rounded-full bg-hot font-semibold text-hot-ink transition hover:opacity-90 disabled:opacity-40">
                  {busy ? "Holding…" : `Hold ${selected.length || ""} seat${selected.length === 1 ? "" : "s"}`}
                </button>
              ) : (
                <a href={`/api/auth/signin?callbackUrl=/events/${eventId}`}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-ink font-semibold text-paper hover:opacity-90">
                  Sign in to hold seats
                </a>
              )}
            </>
          )}
          {message && (
            <p role={message.tone === "error" ? "alert" : "status"}
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${message.tone === "error" ? "bg-hot/10 text-hot" : "bg-paper text-muted"}`}>
              {message.text}
            </p>
          )}
        </div>
        <p className="mt-3 hidden px-1 text-xs text-muted lg:block">Availability refreshes every few seconds. A seat can only ever be held by one person.</p>
      </aside>
    </div>
  );
}

function Legend() {
  const item = (cls: string, text: string) => (
    <span className="flex items-center gap-2"><span aria-hidden className={`h-4 w-4 rounded border ${cls}`} />{text}</span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
      {item("bg-card border-line", "Available")}
      {item("bg-hot border-hot", "Selected")}
      {item("bg-ok border-ok", "Held by you")}
      {item("bg-held/30 border-held", "Held")}
      {item("bg-sold border-sold", "Sold")}
    </div>
  );
}
