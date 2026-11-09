import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { money, when } from "@/lib/format";

export const revalidate = 30;

export default async function Home() {
  const rows = await db.execute<{ id: string; title: string; venue: string; starts_at: Date; status: string; total: number; sold: number; from_cents: number }>(sql`
    select e.id, e.title, e.venue, (e.starts_at at time zone 'UTC') as starts_at, e.status,
      (select count(*)::int from seats s where s.event_id = e.id) as total,
      (select count(*)::int from tickets t where t.event_id = e.id) as sold,
      (select min(price_cents)::int from seats s where s.event_id = e.id) as from_cents
    from ${events} e where e.status in ('on_sale','sold_out') order by e.starts_at`);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">On sale now</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">Get in before it sells out.</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">Pick your seats, hold them for 10 minutes, and pay. If anything fails on the way, you&apos;re refunded automatically.</p>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {rows.map((e) => {
          const left = e.total - e.sold;
          return (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-4 p-6">
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted">{when(new Date(e.starts_at))}</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight group-hover:text-hot">{e.title}</h2>
                    <p className="mt-1 text-muted">{e.venue}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-hot px-3 py-1 text-xs font-semibold text-hot-ink">On sale</span>
                </div>
                {/* ticket-stub perforation */}
                <div aria-hidden className="mx-6 border-t-2 border-dashed border-line" />
                <div className="flex items-center justify-between p-6 pt-4 text-sm">
                  <span>From <strong className="text-base">{money(e.from_cents)}</strong></span>
                  <span className="font-mono tabular-nums text-muted">{left} of {e.total} left</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
