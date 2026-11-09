"use client";

import { useCallback, useEffect, useState } from "react";
import { SeatPicker } from "@/components/seat-picker";

interface Q { enabled: boolean; joined: boolean; admitted: boolean; rank: number | null; ahead: number; etaSeconds: number }

const fmt = (s: number) => (s < 60 ? `under a minute` : `about ${Math.ceil(s / 60)} min`);

/** Fair queue in front of the seat map for high-demand events. Admission is enforced by the server, not this screen. */
export function EventGate({ eventId, signedIn, queueEnabled }: { eventId: string; signedIn: boolean; queueEnabled: boolean }) {
  const [q, setQ] = useState<Q | null>(null);
  const [startRank, setStartRank] = useState<number | null>(null);

  const refresh = useCallback(async (join: boolean) => {
    const r = await fetch(`/api/queue/${eventId}`, join ? { method: "POST" } : undefined);
    if (!r.ok) return;
    const body: Q = await r.json();
    setQ(body);
    setStartRank((cur) => cur ?? (body.ahead > 0 ? body.ahead : null));
  }, [eventId]);

  useEffect(() => {
    if (!queueEnabled || !signedIn) return;
    const first = setTimeout(() => void refresh(true), 0); // joining is idempotent: refreshes keep your place
    const t = setInterval(() => void refresh(false), 5000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [queueEnabled, signedIn, refresh]);

  if (!queueEnabled || q?.admitted) return <SeatPicker eventId={eventId} signedIn={signedIn} />;

  const progress = startRank && q ? Math.min(100, Math.round(((startRank - q.ahead) / startRank) * 100)) : 0;

  return (
    <section className="mt-10 rounded-2xl border border-line bg-card p-6 sm:p-10" aria-live="polite">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Waiting room</p>
      {!signedIn ? (
        <>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">This drop is busy, so there&apos;s a line.</h2>
          <p className="mt-3 max-w-xl text-muted">Sign in to join. Places are first come, first served, and refreshing never loses your spot.</p>
          <a href={`/signin?callbackUrl=/events/${eventId}`} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-6 font-semibold text-paper hover:opacity-90">Sign in to join the line</a>
        </>
      ) : !q ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-paper" aria-label="Joining the line" />
      ) : (
        <>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">You&apos;re in line.</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div><p className="text-sm text-muted">People ahead of you</p><p className="mt-1 text-4xl font-bold tabular-nums">{q.ahead.toLocaleString("en-IN")}</p></div>
            <div><p className="text-sm text-muted">Estimated wait</p><p className="mt-1 text-4xl font-bold">{fmt(q.etaSeconds)}</p></div>
            <div><p className="text-sm text-muted">Your place</p><p className="mt-1 text-4xl font-bold tabular-nums">#{q.rank?.toLocaleString("en-IN")}</p></div>
          </div>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress through the line">
            <div className="h-full rounded-full bg-hot transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-4 text-sm text-muted">Keep this page open. When it&apos;s your turn the seat map opens here automatically, and you&apos;ll have 10 minutes to pick and pay.</p>
        </>
      )}
    </section>
  );
}
