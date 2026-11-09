# TicketRush — Product Requirements (v0.1, draft for approval)

**Owner:** Esheet Vivek · **Status:** Awaiting approval · **Date:** 2026-11-09

## 1. Problem
Ticket drops fail in the same few ways: the site falls over when thousands arrive at once, two people get sold the same seat, and when the payment gateway hiccups people are charged without getting a ticket. Fixing the money is manual and slow.

TicketRush is an event ticketing product built specifically for the worst five minutes of a sale.

## 2. Goals (measurable)
| # | Goal | How we prove it |
|---|------|-----------------|
| G1 | No seat is ever sold twice | DB unique constraint + concurrency test with 3,000 simultaneous buyers for 500 seats: exactly 500 tickets issued |
| G2 | No one is charged without a ticket, or the charge is refunded automatically | Fault-injection test: gateway timeouts, lost webhooks, server crash mid-payment → every successful charge ends as *ticket issued* or *refunded*, zero orphans |
| G3 | Stays usable under a 10,000-user surge | k6 load test: 10k virtual users browsing, 3k concurrently checking out; p95 page < 800 ms, error rate < 1% (results published, whatever they are) |
| G4 | Secure by default | OWASP Top 10 checklist, auth/authorization tests, tampering tests (price, quantity, other users' orders) all fail safely |
| G5 | Fair queue | Waiting room admits buyers in arrival order at a controlled rate |

## 3. Users
- **Buyer:** finds an event, waits in the queue if it's busy, picks seats, pays, gets a QR ticket.
- **Organizer:** creates an event, sets sections/prices, watches sales and refunds live.
- **Gate staff (later):** scans QR tickets at entry.

## 4. Scope — v1
In: sign-in (email magic link + GitHub), event list and event page, seat map with live availability, waiting room, seat holds (10 min), Stripe checkout (test mode), webhooks, automatic refunds, reconciler, "My tickets" with signed QR codes, organizer dashboard (sales, holds, refunds), audit log, rate limiting, load-test and fault-injection suites, public design + results docs.

Out (v1): real money, resale marketplace, mobile apps, multiple currencies, dynamic pricing.

## 5. Non-functional requirements
- **Payments:** test mode only (Stripe by default, Razorpay supported via the same gateway adapter). Card data never touches our servers (Stripe Elements → PCI SAQ-A scope).
- **Security:** HTTPS only (HSTS), httpOnly/Secure/SameSite cookies, CSRF protection, server-side authorization on every request, rate limits per IP and per user, signed webhooks, secrets only in Vercel env, PII encrypted at the field level.
- **Reliability:** every money-moving operation is idempotent; the database is the source of truth.
- **Performance:** event pages cached at the edge; checkout API p95 < 500 ms at 3k concurrent.
- **Accessibility:** WCAG 2.1 AA for buyer flows, keyboard-usable seat map.
- **Observability:** structured logs with request IDs, order state history, a public status/results page.

## 6. Success criteria for "done"
All five goals have a passing automated test or a published measured result, the app is live on Vercel, and the case study (architecture, security model, load-test numbers) is on the portfolio.

## 7. Open decisions for Esheet
1. Approve scope v1 as above.
2. Event type to seed: one big concert (reserved seating, 500 seats) + one general-admission event.
3. ~~Budget~~ Decided: $0. Free tiers only (Vercel Hobby, Neon free, Upstash free, GitHub Actions). The full 10k load test runs in GitHub Actions against the app plus local Postgres and Redis containers, so no paid infrastructure is needed.
4. Payment gateway: Stripe test mode, with Razorpay test mode as a drop-in alternative behind the same adapter.
