# M7 — Load test: 10,000 browsing + 3,000 buyers racing for 500 seats

**Date:** 2026-11-10 · **Workflow:** `.github/workflows/load-test.yml` (run it from the Actions tab).

## Setup ($0)

Everything runs on **one GitHub-hosted runner: 4 vCPU (AMD EPYC 7763), 16 GB RAM**. That one machine
runs k6 (the 13,000 virtual users), nginx, three `next start` app instances and Postgres. The load
generator competes with the system it's testing for the same 4 CPUs, so the latency numbers here are a
floor on what the code can do, not what Vercel would show.

- **Browsing:** ramps to 10,000 virtual users reading `/`, `/events` and the seat map for 3 minutes.
- **Buying:** 3,000 signed-in buyers arrive together for a 500-seat event: join the line → hold 1–2
  seats (retry on conflict) → checkout → pay → wait for tickets.
- **Faults injected:** 3% of gateway calls time out before charging, 3% charge and lose the response,
  5% of completed payments never send their webhook. 100 ms gateway latency.
- **nginx caches what Vercel's CDN would:** only responses the app marks cacheable (ISR pages, the
  2-second seat map).
- **After the run:** the reconciler runs as if 41 minutes had passed, then the invariants are checked
  directly in Postgres.

## Correctness: held in every run

| Run | Seats sold | Sold twice | Charged without ticket | Lost webhooks settled by reconciler | Orders left unsettled |
| --- | ---: | ---: | ---: | ---: | ---: |
| Waiting room on (as deployed) | 500 / 500 | 0 | 0 | 15 of 15 | 0 |
| Waiting room bypassed (worst case) | 497 / 500 | 0 | 0 | 16 of 16 | 0 |
| Buyers only, line bypassed | 500 / 500 | 0 | 0 | 20 of 20 | 0 |

Goals G1 (no seat sold twice) and G2 (no charge without a ticket or refund) are met under load and
injected failures.

## Speed (waiting room on, 10,000 browsing at the same time)

| Step | median | p95 | p99 |
| --- | ---: | ---: | ---: |
| Browse (home, events, seat map) | 1 ms | 581 ms | 1,643 ms |
| Join the line (3,000 at once) | 20.4 s | 30.3 s | 31.4 s |
| Hold seats | 2.6 s | 4.4 s | 4.6 s |
| Checkout | 2.0 s | 5.2 s | 5.5 s |
| Pay | 2.5 s | 5.3 s | 5.9 s |

651,764 requests in total (3,122 per second), 13,001 peak virtual users, **0% browse errors**.

- **G3 browsing target met:** p95 581 ms (< 800 ms) with 0% errors at 10,000 users.
- **Checkout target missed on this hardware:** hold and checkout p95 are 4–5 s against a 500 ms goal.
  The first request from 3,000 simultaneous buyers takes 20 s to drain, because 4 shared CPUs process
  signed-in requests at a few hundred per second, about 3–4 ms of CPU each in the Next.js server.
- **Isolated rehearsal** (same code, 300 buyers, waiting room on, no browse load): admitted → ticket
  median 626 ms, checkout p95 492 ms, hold p95 642 ms.

## What this means, and what's next

1. Correctness doesn't depend on speed: under overload, buyers wait longer but nobody is double-sold
   or charged without a ticket.
2. On Vercel the per-request cost is spread across many function instances, so this ceiling is about
   cost per buyer, not a hard limit. The 4-CPU number is the honest single-machine figure.
3. Biggest wins next: cache session lookups for a few seconds per instance, admit from the line in
   smaller steps, and run the generator on a separate runner so its CPU isn't counted against the app.
