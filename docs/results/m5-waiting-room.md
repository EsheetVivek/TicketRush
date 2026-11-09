# Milestone 5 — waiting room (verified)

Automated tests in `tests/queue.test.ts`.

| Scenario | Expected | Result |
|---|---|---|
| 2,000 people join at the same moment | 2,000 unique places, 1…2,000, no gaps; first 100 admitted (burst); last person sees 1,900 ahead and a 6 min 20 s estimate at 300/min | Pass (local: 1.5 s) |
| Refresh or rejoin | Keeps the original place | Pass |
| Not yet admitted, or never joined, calls the hold API directly | Refused with `QUEUE` (403); the line can't be skipped | Pass |
| Ten seconds later | 50 more admitted (300/min); the same buyer can now hold seats | Pass |

**Design:** admission is a formula, not a background job: everyone ranked within `burst + rate × minutes since on-sale` is admitted. There is no release worker to fall behind or crash, every server instance computes the same answer, and the order is strictly first come, first served (position comes from a database sequence).
