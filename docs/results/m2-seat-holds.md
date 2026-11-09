# Milestone 2 — seat hold concurrency (measured)

**Test:** `tests/holds.test.ts` → "3,000 buyers racing for 500 seats"
**What it does:** 3,000 distinct signed-in buyers fire hold requests at the same moment for 1–3 heavily overlapping seats each, all aimed at the same 500-seat event.

| Run | Environment | Hold requests | Holds granted | Seats held | Seats held twice | Rejected cleanly (`HELD`) | Wall time |
|---|---|---|---|---|---|---|---|
| 2026-11-09 | Dev container, Postgres 17 local, 40 DB connections | 3,000 | 262 | 500 | **0** | 2,738 | 3.7 s |

**What this proves:** the all-or-nothing hold transaction and the `seat_holds.seat_id` primary key never grant one seat to two buyers, even under heavy contention, and every losing request gets a clear "someone else is holding these seats" answer instead of an error. The database's view matches exactly what buyers were told.

**What it does not prove yet:** behaviour behind the real network path on Vercel + Neon, and the payment step. Those are covered by milestones 3–7. This test re-runs on every push in CI.
