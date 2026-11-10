import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { formatSeats, getOrderHistory, HISTORY_PAGE_SIZE, shortRef, type HistoryRow } from "@/lib/history";
import { istDateTime, money } from "@/lib/format";
import { CopyConfirm } from "@/components/watermelon/copy-confirm";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

export default async function MyOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?callbackUrl=/account/orders");
  const { page: raw } = await searchParams;
  // Only the session's user id is used: there is no way to ask for anyone else's orders.
  const { rows, stats, page, pages } = await getOrderHistory(db, session.user.id, Number(raw ?? 1));
  const from = (page - 1) * HISTORY_PAGE_SIZE + 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">My orders</h1>
      <p className="mt-2 text-muted">Every order you&apos;ve placed, newest first. Times are in IST.</p>

      {stats.orders === 0 ? (
        <section className="card mt-10 flex flex-col items-start gap-4 p-8 sm:p-12">
          <h2 className="text-xl font-semibold tracking-tight">No orders yet</h2>
          <p className="max-w-md text-muted">When you buy tickets they&apos;ll show up here, with their QR codes one tap away.</p>
          <Link href="/events" className="btn-primary">Browse events</Link>
        </section>
      ) : (
        <>
          <dl className="mt-10 grid grid-cols-3 gap-2 sm:gap-4">
            <Stat label="Total spent" value={money(stats.spentCents)} note="on ticketed orders" />
            <Stat label="Tickets held" value={stats.ticketsHeld.toLocaleString("en-IN")} note={`across ${stats.orders} order${stats.orders === 1 ? "" : "s"}`} />
            <Stat label="Refunds" value={stats.refunds.toLocaleString("en-IN")} note={stats.refundedCents ? `${money(stats.refundedCents)} returned` : "none needed"} />
          </dl>

          {/* Desktop: table */}
          <div className="card mt-8 hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Your orders, newest first</caption>
              <thead className="bg-sunk text-xs text-muted">
                <tr>
                  {["Date (IST)", "Event", "Seats", "Amount", "Status", "Payment ref", ""].map((h, i) => (
                    <th key={i} scope="col" className={`px-4 py-3 font-medium ${h === "Amount" ? "text-right" : ""}`}>{h || <span className="sr-only">Action</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((o) => (
                  <tr key={o.id} className="align-middle">
                    <td className="whitespace-nowrap px-4 py-3 text-muted tabular-nums">{istDateTime(o.createdAt).replace(" IST", "")}</td>
                    <td className="px-4 py-3 font-medium">{o.eventTitle}</td>
                    <td className="px-4 py-3">{formatSeats(o.seats)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(o.amountCents)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-1">{o.gatewayRef ? <CopyConfirm value={o.gatewayRef} display={shortRef(o.gatewayRef)} /> : <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-1 text-right"><Action o={o} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="mt-8 flex flex-col gap-4 md:hidden">
            {rows.map((o) => (
              <li key={o.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted tabular-nums">{istDateTime(o.createdAt)}</p>
                    <p className="mt-1 font-medium">{o.eventTitle}</p>
                    <p className="mt-1 text-sm">{formatSeats(o.seats)}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{money(o.amountCents)}</p>
                </div>
                <div className="stub-rule mt-4 flex flex-wrap items-center justify-between gap-2 pt-2">
                  <StatusBadge status={o.status} />
                  {o.gatewayRef && <CopyConfirm value={o.gatewayRef} display={shortRef(o.gatewayRef)} />}
                </div>
                <div className="mt-2"><Action o={o} block /></div>
              </li>
            ))}
          </ul>

          <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
            <p>Showing {from}–{from + rows.length - 1} of {stats.orders}</p>
            <div className="flex gap-2">
              {page > 1 ? <Link className="btn-secondary" href={`/account/orders?page=${page - 1}`}>Previous</Link> : <span aria-disabled className="btn-secondary opacity-50">Previous</span>}
              {page < pages ? <Link className="btn-secondary" href={`/account/orders?page=${page + 1}`}>Next</Link> : <span aria-disabled className="btn-secondary opacity-50">Next</span>}
            </div>
          </nav>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-line sm:p-6">
      <dt className="text-xs text-muted sm:text-sm">{label}</dt>
      <dd className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</dd>
      <dd className="mt-1 hidden text-xs text-muted sm:block">{note}</dd>
    </div>
  );
}

function Action({ o, block = false }: { o: HistoryRow; block?: boolean }) {
  const label = o.status === "Ticketed" ? "View tickets" : "View order";
  return <Link href={`/orders/${o.id}`} prefetch={false} className={`${o.status === "Ticketed" ? "btn-secondary" : "btn-quiet"} ${block ? "w-full" : ""}`}>{label}</Link>;
}
