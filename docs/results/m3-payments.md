# Milestone 3 — orders, payments and webhooks (verified)

All scenarios below are automated tests in `tests/orders.test.ts`, run against real Postgres on every push. Payments use the mock gateway, which follows Stripe's rules for idempotency keys and signed webhooks and can inject failures.

| Scenario | Expected | Result |
|---|---|---|
| Buyer pays for 2 held seats | Amount computed from DB prices; 2 tickets; hold released | Pass |
| Double-clicked checkout (two concurrent requests, same key) | One order, one payment | Pass |
| Checkout without a live hold, or with another buyer's checkout key | Rejected | Pass |
| Same webhook delivered 3 times concurrently | Tickets issued exactly once | Pass |
| Forged signature, or body changed after signing | Rejected | Pass |
| Payment succeeds after the seat was sold to someone else | Order refunded automatically, no ticket, gateway shows refunded | Pass |
| Gateway processes the payment but the response is lost | Retry with the same key returns the same payment; one charge | Pass |
| Gateway fully down at checkout | Clean "try again" error, seats stay held; on recovery the same order is reused | Pass |
| Crash after charging, before saving the payment reference | Webhook still finds the order via echoed order ID and fulfils it | Pass |
| 100 buyers paying at once, every webhook delivered twice | 100 orders ticketed, 100 unique seats, no duplicates | Pass (local run: 0.9 s) |

Also verified over real HTTP against a production build (2026-11-09): extra fields such as a client-sent price are rejected (400); another signed-in user gets 404 for someone else's order and cannot pay it; a forged webhook returns 400.

Not yet covered: the reconciler for webhooks that never arrive and stuck refunds (milestone 4), and load at 3,000 concurrent checkouts (milestone 7).
