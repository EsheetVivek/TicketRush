# TicketRush

Event ticketing built for the worst five minutes of a sale: a ticket drop where thousands of people pay at once.

- **No seat sold twice:** all-or-nothing seat holds (one SQL statement, `seat_holds.seat_id` primary key) plus a Postgres `UNIQUE(event_id, seat_id)` guarantee on tickets.
- **No charge without a ticket:** idempotent payments, signed webhooks and a reconciler that refunds orphaned charges.
- **Secure by default:** database sessions in httpOnly cookies, server-side authorization, field-level PII encryption, signed QR tickets.

Docs: [Requirements](docs/01-PRD.md) · [System design](docs/02-SYSTEM-DESIGN.md) · [Results](docs/results/)

Live (test mode): https://ticketrush-ten.vercel.app · landing page at `/`, events at `/events`, your orders at `/account/orders`.

## Status

| Milestone | Status |
|---|---|
| 1. Skeleton: Next.js, schema, auth, CI, Vercel | Done · deployed |
| 2. Events, seat map, holds | Done · [concurrency result](docs/results/m2-seat-holds.md) |
| 3. Orders, payments, webhooks | Done · [verified scenarios](docs/results/m3-payments.md) |
| 4. Refunds, reconciler, circuit breaker | Done · [verified scenarios](docs/results/m4-reconciler.md) |
| 5. Waiting room | Done · [verified scenarios](docs/results/m5-waiting-room.md) |
| 5b. Speed, calmer UI, order history, landing page | Done · [local speed measurements](docs/results/m5b-speed.md) |
| 6. Concurrency, fault-injection and security tests | Not started |
| 7. Load test and published results | Not started |
| 8. Portfolio case study | Not started |

Measured results will be published in `docs/results/` as they exist. Nothing is claimed before it is measured.

## Run locally

```bash
cp .env.example .env.local   # fill in the values
npm ci
npm run db:migrate
npm run dev
```

Health check: `GET /api/health` (`latencyMs` is one function → database round trip; above ~20 ms usually means the function and database regions differ, see [m5b-speed.md](docs/results/m5b-speed.md#what-decides-speed-in-production)).

Speed tooling: `scripts/bench-flow.ts` (p50/p95 of hold → checkout → pay), `scripts/count-roundtrips.ts`, `scripts/explain-hot-paths.ts`, `scripts/latency-proxy.mjs`. The hot API routes send `Server-Timing` headers (`db`, `auth`, `gateway`, `total`).

## Stack

Next.js (App Router) on Vercel · Neon Postgres · Upstash Redis · Auth.js · Drizzle · Stripe or Razorpay (test mode) · Vitest · k6 · GitHub Actions
