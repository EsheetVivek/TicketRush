import Link from "next/link";
import { db } from "@/db";
import { listEvents } from "@/lib/events";
import { EventCard } from "@/components/event-card";

export const revalidate = 30;

const REPO = "https://github.com/EsheetVivek/TicketRush";

const STEPS = [
  { title: "Join the line", body: "For a big drop you get a place in a first-come, first-served waiting room. Refreshing never loses your spot." },
  { title: "Hold your seats", body: "Pick up to 6 seats. They're held for you alone for 10 minutes, all of them or none." },
  { title: "Pay", body: "The price is read from our database, never from your browser. A double click can't charge you twice." },
  { title: "Get QR tickets", body: "Tickets are issued the moment payment is confirmed. Each QR code is signed and works once." },
];

// Every claim here is backed by an automated test described in docs/results.
const GUARANTEES = [
  { title: "No seat is sold twice", body: "3,000 buyers racing for 500 seats in one test: zero seats held twice. A database uniqueness rule on (event, seat) is the final word on every ticket.", doc: "m2-seat-holds.md" },
  { title: "Charged but no ticket? Refunded automatically", body: "If a payment lands after the seat went to someone else, the order is refunded without anyone lifting a finger. A webhook that never arrives is caught by a reconciler that runs every 5 minutes.", doc: "m4-reconciler.md" },
  { title: "A fair waiting room", body: "2,000 people joining at the same moment get 2,000 unique places. The line is enforced on the server, so calling the API directly can't skip it.", doc: "m5-waiting-room.md" },
  { title: "Gateway outages handled", body: "If the payment provider stops responding, checkout fails fast with a clear message, your seats stay held (extended up to 30 minutes), and retrying reuses the same payment.", doc: "m3-payments.md" },
];

const SECURITY = [
  ["Sessions", "Opaque session ID in an httpOnly, SameSite cookie; revocable on the server. No tokens in the browser's storage."],
  ["CSRF and origin checks", "Every state-changing request must come from this site's origin; unknown fields such as a client-sent price are rejected."],
  ["Signed webhooks", "Payment notifications are verified by signature with a 5-minute replay window and processed at most once."],
  ["Field encryption", "Personal fields such as phone numbers are encrypted with AES-256-GCM, on top of the database's own encryption at rest."],
  ["Signed QR tickets", "Each QR code carries the ticket ID and an HMAC-SHA256 signature, so a forged or edited ticket fails at the gate."],
  ["Private orders", "Every order lookup is filtered by the signed-in user. Someone else's order looks exactly like one that doesn't exist."],
];

const STACK = ["Next.js App Router", "TypeScript", "Postgres (Neon)", "Drizzle ORM", "Auth.js", "Stripe test mode", "Tailwind CSS", "Vitest", "Vercel"];

const FAQ = [
  ["Is this real money?", "No. Payments run in test mode: either Stripe's test environment (card 4242 4242 4242 4242) or a built-in test gateway. Nothing is ever charged."],
  ["What happens if something goes wrong after I pay?", "If tickets can't be issued, for example because the seat was taken while your payment was processing, the full amount is refunded automatically and your order shows the refund."],
  ["How long is a hold?", "10 minutes from the moment you hold your seats. The countdown is on the page. If payments are briefly down, the hold is extended so you don't lose your seats."],
  ["Why is there a queue?", "When thousands of people arrive at once, a line keeps it fair: places are first come, first served, and people are let in at a steady rate so checkout stays fast for everyone."],
];

export default async function Home() {
  const events = await listEvents(db, 4);
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        <p className="eyebrow">Event ticketing · test mode</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Ticketing that stays fair and correct when everyone buys at once.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          TicketRush sells seats for high-demand events: a fair waiting room, seats held for you while you pay, and tickets or an automatic refund, never a charge without a seat.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/events" className="btn-primary px-6">Browse events</Link>
          <Link href="#how-it-works" className="btn-secondary px-6">How it works</Link>
        </div>
        <p className="mt-6 text-sm text-muted">Payments run in test mode. No real money is ever charged.</p>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-8 border-t border-line bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">From the line to your ticket in four steps</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card relative flex flex-col p-6">
                <span className="font-mono text-xs text-muted">Step {i + 1} of 4</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.body}</p>
                {i < STEPS.length - 1 && <span aria-hidden className="absolute -right-3 top-1/2 hidden h-px w-2 bg-line-strong lg:block" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Guarantees */}
      <section aria-labelledby="busy-title" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">Under pressure</p>
          <h2 id="busy-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Built for the busiest five minutes</h2>
          <p className="mt-3 max-w-2xl text-muted">Ticket drops fail in predictable ways. Each of these is covered by an automated test that runs on every change.</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {GUARANTEES.map((g) => (
              <li key={g.title} className="card flex flex-col p-6">
                <h3 className="font-semibold">{g.title}</h3>
                <p className="mt-2 text-sm text-muted">{g.body}</p>
                <a href={`${REPO}/blob/main/docs/results/${g.doc}`} className="link mt-auto inline-flex min-h-11 items-center self-start pt-4 text-sm">See the test results</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Live events */}
      <section aria-labelledby="events-title" className="border-t border-line bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">On sale now</p>
              <h2 id="events-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Live events</h2>
            </div>
            <Link href="/events" className="btn-secondary">All events</Link>
          </div>
          {events.length ? (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2">
              {events.map((e) => <li key={e.id}><EventCard e={e} /></li>)}
            </ul>
          ) : (
            <p className="card mt-10 p-8 text-muted">No events are on sale right now.</p>
          )}
        </div>
      </section>

      {/* Security and tech */}
      <section aria-labelledby="security-title" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">Security and tech</p>
          <h2 id="security-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Secure by default</h2>
          <dl className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(([t, b]) => (
              <div key={t}>
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-2 text-sm text-muted">{b}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-12">
            <h3 className="text-sm font-semibold">Stack</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {STACK.map((s) => <li key={s} className="badge border border-line bg-card text-ink">{s}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="border-t border-line bg-card/50">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Questions</h2>
          <div className="mt-8 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span aria-hidden className="text-muted transition-transform duration-150 group-open:rotate-45">+</span>
                </summary>
                <p className="pb-4 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>TicketRush · a portfolio project. Payments run in test mode.</p>
          <ul className="flex flex-wrap gap-x-4">
            <li><a className="link inline-flex min-h-11 items-center" href={REPO}>GitHub</a></li>
            <li><a className="link inline-flex min-h-11 items-center" href={`${REPO}/blob/main/docs/02-SYSTEM-DESIGN.md`}>System design</a></li>
            <li><a className="link inline-flex min-h-11 items-center" href={`${REPO}/tree/main/docs/results`}>Test results</a></li>
          </ul>
        </div>
      </footer>
    </main>
  );
}
