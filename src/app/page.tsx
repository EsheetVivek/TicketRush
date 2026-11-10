import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { listEvents } from "@/lib/events";
import { EventCard } from "@/components/event-card";
import { HeroVisual } from "@/components/hero-visual";
import { Marquee } from "@/components/poster/marquee";
import { SpinSticker } from "@/components/poster/spin-sticker";
import { HowItWorks } from "@/components/how-it-works";
import { FaqAccordion } from "@/components/watermelon/faq-accordion";
import { SiteFooter } from "@/components/site-footer";
import { FAQ, GUARANTEES, REPO } from "@/lib/content";

export const revalidate = 30;

export default async function Home() {
  const events = await listEvents(db, 4);
  return (
    <main>
      {/* Hero: gig poster */}
      <section className="relative overflow-hidden border-b-2 border-ink">
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-24">
          <div className="relative">
            <p className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.18em]">
              <ShieldCheck aria-hidden className="size-4 text-ok" />Test mode · no real money moves
            </p>
            <h1 className="display mt-5 text-[clamp(3.2rem,8.2vw,6.4rem)]">
              Fair tickets<br />when <span className="sticker">everyone</span><br />buys at <span className="text-hot">once.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              A fair waiting room, seats held just for you while you pay, and tickets or an automatic refund. Never a charge without a seat.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <PendingLink href="/events" className="btn-primary px-6 text-base">Get tickets<ArrowRight aria-hidden className="size-4" /></PendingLink>
              <PendingLink href="/how-it-works" className="btn-secondary px-6">How it works</PendingLink>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 border-2 border-ink bg-card shadow-soft">
              {[["3,000", "racing buyers tested"], ["0", "seats sold twice"], ["10 min", "hold window"]].map(([v, l], i) => (
                <div key={l} className={`p-3 sm:p-4 ${i ? "border-l-2 border-ink" : ""}`}>
                  <dd className="display text-3xl tabular-nums sm:text-4xl">{v}</dd>
                  <dt className="mt-1 font-mono text-[10px] uppercase leading-tight text-muted">{l}</dt>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative pb-10 pt-4">
            <HeroVisual />
            <SpinSticker text="no seat sold twice · tested with 3,000 buyers · " className="absolute -bottom-12 -left-2 sm:-left-8"
              center={<span className="display text-3xl leading-none">0<br /><span className="font-mono text-[9px] tracking-wider">sold twice</span></span>} />
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="border-b-2 border-ink bg-hot py-3 text-hot-ink">
        <Marquee duration={32} gap="2.5rem">
          {["Monsoon Beats Live", "No seat sold twice", "Indie Night", "10-minute holds", "Automatic refunds", "Fair waiting room", "Signed QR tickets"].map((t) => (
            <span key={t} className="display flex items-center gap-10 whitespace-nowrap text-2xl sm:text-3xl">{t}<span aria-hidden className="text-acid">✶</span></span>
          ))}
        </Marquee>
      </div>

      {/* How it works */}
      <section aria-labelledby="how-title" className="border-b-2 border-ink bg-sunk">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="mt-2 max-w-xl text-4xl display text-balance sm:text-6xl">From the line to your ticket in four steps</h2>
          <div className="mt-12"><HowItWorks /></div>
        </div>
      </section>

      {/* Guarantees: bento */}
      <section aria-labelledby="busy-title" className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow">Under pressure</p>
          <h2 id="busy-title" className="mt-2 text-4xl display sm:text-6xl">Built for the busiest five minutes</h2>
          <p className="mt-4 max-w-2xl text-muted">Ticket drops fail in predictable ways. Each of these is covered by an automated test that runs on every change.</p>
          <ul className="mt-12 grid gap-4 md:grid-cols-6">
            {GUARANTEES.map((g, i) => (
              <li key={g.title} className={`flex flex-col rounded-xl p-6 border-2 border-ink shadow-soft sm:p-8 ${i === 0 || i === 3 ? "md:col-span-4" : "md:col-span-2"} ${i === 0 ? "bg-ink text-paper" : i === 3 ? "bg-acid text-acid-ink" : "bg-card"}`}>
                <p className="flex items-baseline gap-3"><span className={`display tabular-nums ${i === 0 ? "text-7xl text-hot sm:text-8xl" : "text-6xl"}`}>{g.stat}</span><span className="font-mono text-xs uppercase opacity-75">{g.unit}</span></p>
                <h3 className="mt-6 text-lg font-bold">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-80">{g.body}</p>
                <a href={`${REPO}/blob/main/docs/results/${g.doc}`} className="mt-auto inline-flex min-h-11 items-center gap-1 self-start pt-4 font-mono text-xs font-bold uppercase underline decoration-2 underline-offset-4">
                  See the test results<ArrowRight aria-hidden className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Live events */}
      <section aria-labelledby="events-title" className="border-b-2 border-ink bg-sunk">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">On sale now</p>
              <h2 id="events-title" className="mt-2 text-4xl display sm:text-6xl">Live events</h2>
            </div>
            <PendingLink href="/events" className="btn-secondary">All events<ArrowRight aria-hidden className="size-4" /></PendingLink>
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
      <section aria-labelledby="faq-title" className="border-b-2 border-ink">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title" className="mt-2 text-4xl display sm:text-6xl">Questions</h2>
            <p className="mt-4 text-muted">Curious how it holds up? <Link href="/how-it-works" className="link">Read how it works</Link>.</p>
          </div>
          <FaqAccordion items={FAQ} />
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-xl border-2 border-ink bg-ink px-6 py-10 text-paper shadow-[6px_6px_0_var(--hot)] sm:flex-row sm:items-center sm:px-10">
          <div>
            <h2 className="display text-5xl sm:text-6xl">Try a ticket <span className="text-acid">drop.</span></h2>
            <p className="mt-2 text-paper/70">Sign in with Google or GitHub, join the line and pick your seats. It takes a minute.</p>
          </div>
          <PendingLink href="/events" className="btn-primary px-6">Browse events<ArrowRight aria-hidden className="size-4" /></PendingLink>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
