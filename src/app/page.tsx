import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { listEvents } from "@/lib/events";
import { EventCard } from "@/components/event-card";
import { HeroVisual } from "@/components/hero-visual";
import { HowItWorks } from "@/components/how-it-works";
import { FaqAccordion } from "@/components/watermelon/faq-accordion";
import { SiteFooter } from "@/components/site-footer";
import { FAQ, GUARANTEES, REPO } from "@/lib/content";

export const revalidate = 30;

export default async function Home() {
  const events = await listEvents(db, 4);
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_70%_30%,var(--hot-soft),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:pb-28">
          <div>
            <span className="pill-surface inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
              <ShieldCheck aria-hidden className="size-3.5 text-ok" />Test mode · no real money moves
            </span>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Tickets that stay fair when everyone buys at once.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              A fair waiting room, seats held just for you while you pay, and tickets or an automatic refund. Never a charge without a seat.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/events" className="btn-primary px-6">Browse events<ArrowRight aria-hidden className="size-4" /></Link>
              <Link href="/how-it-works" className="btn-secondary px-6">How it works</Link>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6">
              <div><dt className="text-xs text-muted">Racing buyers tested</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">3,000</dd></div>
              <div><dt className="text-xs text-muted">Seats sold twice</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">0</dd></div>
              <div><dt className="text-xs text-muted">Hold window</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">10 min</dd></div>
            </dl>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="border-t border-line bg-sunk/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">From the line to your ticket in four steps</h2>
          <div className="mt-12"><HowItWorks /></div>
        </div>
      </section>

      {/* Guarantees: bento */}
      <section aria-labelledby="busy-title" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow">Under pressure</p>
          <h2 id="busy-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Built for the busiest five minutes</h2>
          <p className="mt-4 max-w-2xl text-muted">Ticket drops fail in predictable ways. Each of these is covered by an automated test that runs on every change.</p>
          <ul className="mt-12 grid gap-4 md:grid-cols-6">
            {GUARANTEES.map((g, i) => (
              <li key={g.title} className={`flex flex-col rounded-3xl bg-card p-6 shadow-soft ring-1 ring-line sm:p-8 ${i === 0 || i === 3 ? "md:col-span-4" : "md:col-span-2"}`}>
                <p className="flex items-baseline gap-2"><span className="text-4xl font-semibold tracking-tight tabular-nums">{g.stat}</span><span className="text-sm text-muted">{g.unit}</span></p>
                <h3 className="mt-6 font-semibold">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{g.body}</p>
                <a href={`${REPO}/blob/main/docs/results/${g.doc}`} className="mt-auto inline-flex min-h-11 items-center gap-1 self-start pt-4 text-sm font-medium hover:text-hot">
                  See the test results<ArrowRight aria-hidden className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Live events */}
      <section aria-labelledby="events-title" className="border-t border-line bg-sunk/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">On sale now</p>
              <h2 id="events-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Live events</h2>
            </div>
            <Link href="/events" className="btn-secondary">All events<ArrowRight aria-hidden className="size-4" /></Link>
          </div>
          {events.length ? (
            <ul className="mt-12 grid gap-6 sm:grid-cols-2">
              {events.map((e) => <li key={e.id}><EventCard e={e} /></li>)}
            </ul>
          ) : (
            <p className="card mt-12 p-8 text-muted">No events are on sale right now.</p>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
            <p className="mt-4 text-muted">Curious how it holds up? <Link href="/how-it-works" className="link">Read how it works</Link>.</p>
          </div>
          <FaqAccordion items={FAQ} />
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-ink px-6 py-10 text-paper sm:flex-row sm:items-center sm:px-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Try a ticket drop.</h2>
            <p className="mt-2 text-paper/70">Sign in with Google or GitHub, join the line and pick your seats. It takes a minute.</p>
          </div>
          <Link href="/events" className="btn-primary px-6">Browse events<ArrowRight aria-hidden className="size-4" /></Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
