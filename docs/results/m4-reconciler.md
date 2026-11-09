# Milestone 4 — reconciler, refunds and outage handling (verified)

Automated tests in `tests/reconcile.test.ts` and `tests/breaker.test.ts`.

| Scenario | Expected | Result |
|---|---|---|
| Buyer is charged but the webhook never arrives | Reconciler finds the payment and issues the tickets; running it again changes nothing | Pass |
| Refund needed while the gateway is down | Order waits in `refund_pending`; next reconciler run completes the refund | Pass |
| Buyer abandons checkout | Order expires after the hold plus a 30-minute grace period; seats free up | Pass |
| Buyer paid but no webhook, order looks abandoned | Reconciler asks the gateway, sees the payment and issues tickets instead of expiring | Pass |
| Gateway down at checkout | Clean error; the buyer's hold is extended (up to 30 min past the original expiry) | Pass |
| Gateway keeps failing | Circuit breaker opens after 5 failures and fails fast for 20 s, then lets one trial through | Pass |

**Schedule ($0):** GitHub Actions calls `/api/cron/reconcile` every 5 minutes (free for public repos); Vercel Cron calls it daily as a backup. The endpoint requires `Authorization: Bearer <CRON_SECRET>` and compares it in constant time.
