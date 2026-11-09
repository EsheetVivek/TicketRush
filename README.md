# TicketRush

Event ticketing built for the worst five minutes of a sale: a ticket drop where thousands of people pay at once.

- **No seat sold twice:** Redis holds plus a Postgres `UNIQUE(event_id, seat_id)` guarantee.
- **No charge without a ticket:** idempotent payments, signed webhooks and a reconciler that refunds orphaned charges.
- **Secure by default:** database sessions in httpOnly cookies, server-side authorization, field-level PII encryption, signed QR tickets.

Docs: [Requirements](docs/01-PRD.md) · [System design](docs/02-SYSTEM-DESIGN.md)

## Status

| Milestone | Status |
|---|---|
| 1. Skeleton: Next.js, schema, auth, CI, Vercel | Done · deployed |
| 2. Events, seat map, holds | Done · [concurrency result](docs/results/m2-seat-holds.md) |
| 3. Orders, payments, webhooks | Not started |
| 4. Refunds, reconciler, circuit breaker | Not started |
| 5. Waiting room | Not started |
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

Health check: `GET /api/health`.

## Stack

Next.js (App Router) on Vercel · Neon Postgres · Upstash Redis · Auth.js · Drizzle · Stripe or Razorpay (test mode) · Vitest · k6 · GitHub Actions
