import Link from "next/link";
import type { EventCard as E } from "@/lib/events";
import { money, when } from "@/lib/format";

export function EventCard({ e }: { e: E }) {
  const left = e.total - e.sold;
  return (
    <Link href={`/events/${e.id}`} className="card group flex h-full flex-col transition-colors duration-150 hover:border-line-strong">
      <div className="flex flex-1 items-start justify-between gap-4 p-6">
        <div className="min-w-0">
          <p className="eyebrow">{when(e.startsAt)}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">{e.title}</h3>
          <p className="mt-1 text-sm text-muted">{e.venue}</p>
        </div>
        <span className={`badge shrink-0 ${left > 0 ? "bg-sunk text-ink" : "bg-sunk text-muted"}`}>{left > 0 ? (e.queue ? "Waiting room" : "On sale") : "Sold out"}</span>
      </div>
      {/* ticket-stub perforation */}
      <div aria-hidden className="stub-rule mx-6" />
      <div className="flex items-center justify-between px-6 py-4 text-sm">
        <span className="text-muted">From <span className="font-semibold text-ink">{money(e.fromCents)}</span></span>
        <span className="font-mono text-xs tabular-nums text-muted">{left} of {e.total} left</span>
      </div>
    </Link>
  );
}
