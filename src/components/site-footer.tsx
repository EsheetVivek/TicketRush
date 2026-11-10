import Link from "next/link";
import { REPO } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <p className="flex items-center gap-2 font-semibold"><span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-hot" />TicketRush</p>
          <p className="mt-3 max-w-xs text-muted">Event ticketing built for the busiest five minutes. A portfolio project by Esheet Vivek. Payments run in test mode.</p>
        </div>
        <div>
          <p className="eyebrow">Product</p>
          <ul className="mt-2">
            <li><Link className="inline-flex min-h-11 items-center text-muted hover:text-ink" href="/events">Events</Link></li>
            <li><Link className="inline-flex min-h-11 items-center text-muted hover:text-ink" href="/how-it-works">How it works</Link></li>
            <li><Link className="inline-flex min-h-11 items-center text-muted hover:text-ink" href="/account/orders">My orders</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Engineering</p>
          <ul className="mt-2">
            <li><a className="inline-flex min-h-11 items-center text-muted hover:text-ink" href={REPO}>GitHub</a></li>
            <li><a className="inline-flex min-h-11 items-center text-muted hover:text-ink" href={`${REPO}/blob/main/docs/02-SYSTEM-DESIGN.md`}>System design</a></li>
            <li><Link className="inline-flex min-h-11 items-center text-muted hover:text-ink" href="/results">Test results</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
