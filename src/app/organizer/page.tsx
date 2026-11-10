import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { eventStats, isOrganizer, recentAudit } from "@/lib/organizer";
import { istDateTime, money } from "@/lib/format";
import { AutoRefresh, StartDropButton } from "@/components/organizer-controls";

export const metadata: Metadata = { title: "Organizer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Organizer() {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/organizer");
  if (!isOrganizer(session)) notFound();
  const [stats, audit] = await Promise.all([eventStats(db), recentAudit(db)]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Organizer</p>
          <h1 className="display mt-2 text-5xl sm:text-6xl">Box office</h1>
          <p className="mt-2 text-muted">Live sales, holds, refunds and the waiting room. Payments are in test mode.</p>
        </div>
        <AutoRefresh />
      </div>

      <ul className="mt-10 grid gap-8">
        {stats.map((e) => {
          const pct = e.seats ? Math.round((e.sold / e.seats) * 100) : 0;
          return (
            <li key={e.id} className="card p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="display text-4xl">{e.title}</h2>
                  <p className="mt-1 text-sm text-muted">{e.venue} · on sale since {istDateTime(e.onSaleAt)} · <span className="badge">{e.status.replace("_", " ")}</span></p>
                </div>
                <StartDropButton eventId={e.id} title={e.title} />
              </div>
              <div className="mt-6" aria-label={`${pct}% sold`}>
                <div className="flex h-4 overflow-hidden rounded-md border-2 border-ink bg-card">
                  <span className="bg-ink" style={{ width: `${(e.sold / Math.max(1, e.seats)) * 100}%` }} />
                  <span className="seat-held" style={{ width: `${(e.held / Math.max(1, e.seats)) * 100}%` }} />
                </div>
                <p className="mt-2 font-mono text-xs text-muted">{e.sold} sold · {e.held} held · {e.available} available of {e.seats}</p>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Revenue (test)", money(e.revenueCents)],
                  ["Refunds", `${e.refunds}${e.refundedCents ? ` · ${money(e.refundedCents)}` : ""}`],
                  ["Awaiting payment", String(e.pendingOrders)],
                  [e.queueEnabled ? "Waiting room" : "Waiting room off", e.queueEnabled ? `${e.queueAdmitted} in · ${Math.max(0, e.queueJoined - e.queueAdmitted)} waiting` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border-2 border-ink bg-paper p-3"><dt className="font-mono text-[10px] uppercase text-muted">{k}</dt><dd className="display mt-1 text-2xl tabular-nums">{v}</dd></div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>

      <section className="mt-12" aria-labelledby="audit">
        <h2 id="audit" className="display text-4xl">Audit log</h2>
        <p className="mt-1 text-sm text-muted">Every money-moving or organizer action, newest first.</p>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunk font-mono text-xs uppercase text-muted"><tr><th className="px-4 py-2">When (IST)</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Target</th></tr></thead>
            <tbody className="divide-y divide-line">
              {audit.map((a) => (
                <tr key={a.id}><td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted">{istDateTime(a.at)}</td><td className="px-4 py-2 font-mono">{a.action}</td><td className="px-4 py-2 font-mono text-xs text-muted">{a.target}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
