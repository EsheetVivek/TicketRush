# Milestone 5b — making hold and pay feel instant (measured locally)

**All numbers on this page are local measurements**, not production. They were taken on 2026-11-10 in a
cloud dev container (2 vCPU Intel Xeon @ 2.1 GHz, 7 GB RAM, Node 22), running the production build
(`next build && next start`) against Postgres 18 (embedded-postgres) on the same machine, with the mock
payment gateway. Production runs on Vercel functions (`sin1`) and Neon, where the network between the
two dominates; see "What decides speed in production" below.

## What changed

| Hot path | Database round trips before | After | How |
|---|---|---|---|
| `POST /api/holds` | 12 | **2** | Waiting-room admission, event status, seat validation, sold check, releasing the previous/expired holds and the insert are now **one SQL statement** (plus the session lookup). A single statement is atomic, so all-or-nothing still holds: if any seat is already held, the primary-key violation rolls the whole statement back. Seats are inserted in sorted order so overlapping buyers queue instead of deadlocking. |
| `POST /api/checkout` | 13 | **4** | Idempotency-key lookup, hold lock (`FOR UPDATE`), pricing from the seats table, order + items + audit insert and the event title are one statement; the mock gateway's create is one statement; then the payment reference is saved. |
| `POST /api/mock-pay` (payment → tickets) | 13 | **8** | Ticket issue, order → `ticketed`, hold release and audit entry are one statement inside the order-locking transaction. |
| `GET /api/events/[id]/seats` | 1 | 1 | Ticket lookup now scoped by event so it uses the `(event_id, seat_id)` index. |

Round trips were counted from the Postgres statement log (`scripts/count-roundtrips.ts`, `log_statement = 'all'`),
one request each, including the Auth.js session lookup, `BEGIN` and `COMMIT`.

Also: `Server-Timing` headers (`db`, `auth`, `gateway`, `total`) on all four endpoints; two new indexes
(`tickets(order_id)` for the order page, `orders(user_id, created_at)` for order history) and an
EXPLAIN check that every hot query uses an index (`scripts/explain-hot-paths.ts`). In the browser:
seats show as held the instant you press the button (rolled back if the server refuses), buttons show
a pending state immediately, availability is re-fetched right after a hold or release instead of
waiting for the 3-second poll, and the order page is prefetched (with an instant loading screen) as
soon as checkout starts.

All guarantees are unchanged and re-verified by the test suite (40 tests, including the 3,000-buyer
race, duplicate webhooks, gateway outages and refunds).

## Results

`scripts/bench-flow.ts` runs 200 buyers through hold → checkout → mock pay one after another, then 200
at once, over HTTP with real session cookies (each buyer holds one seat on the 500-seat event, so the
waiting-room check runs too). Times are milliseconds as seen by the client; `server` is the
`Server-Timing` total. 10 warm-up flows run first. Every run ended with exactly 200 tickets.

### Database on the same machine (≈0 ms network)

| 200 sequential | Before p50 / p95 | After p50 / p95 | After, server time p50 / p95 |
|---|---|---|---|
| Hold | 7.3 / 12.1 | 5.5 / 9.1 | 3.6 / 6.3 |
| Checkout (mock gateway) | 9.2 / 15.7 | 7.3 / 12.7 | 5.5 / 9.5 |
| Pay → tickets issued | 9.4 / 13.5 | 8.3 / 14.3 | 6.3 / 12.1 |
| Whole flow | 27.0 / 38.1 | 22.1 / 33.7 | |

| 200 at once (one server process, 5 DB connections) | Before p50 / p95 | After p50 / p95 |
|---|---|---|
| Hold | 995 / 1,400 | 729 / 1,109 |
| Checkout | 1,239 / 1,363 | 954 / 1,030 |
| Pay | 767 / 811 | 758 / 810 |
| Whole flow | 3,036 / 3,242 | 2,443 / 2,610 |
| Wall time for all 200 | 3.3 s | 2.6 s |

With no network between app and database, round trips are almost free, so the gain is small. The
concurrent numbers are dominated by 200 requests queueing for one process's 5 database connections;
on Vercel, concurrent buyers are spread over many function instances.

### Simulated 10 ms round trip to the database

Same machine, but the app reaches Postgres through `scripts/latency-proxy.mjs`, which delays every
packet by 5 ms each way (10 ms round trip, roughly what a nearby but not co-located database costs).
This is where removing round trips pays off.

| 200 sequential | Before p50 / p95 | After p50 / p95 | After, server time p50 / p95 |
|---|---|---|---|
| Hold | 248.5 / 252.1 | **50.4 / 54.0** | 47.5 / 50.6 |
| Checkout (mock gateway) | 272.7 / 279.2 | **96.3 / 101.0** | 93.1 / 97.5 (db 70.0 / 73.5) |
| Pay → tickets issued | 261.7 / 266.8 | **162.6 / 167.6** | 159.2 / 163.8 |
| Whole flow | 783.2 / 795.4 | **310.4 / 318.9** | |

| 200 at once | Before p50 / p95 | After p50 / p95 |
|---|---|---|
| Whole flow | 28,498 / 31,569 | 11,163 / 12,400 |
| Wall time for all 200 | 31.9 s | 12.6 s |

Against the targets (hold < 500 ms server time, checkout < 1 s excluding the gateway, mock payment →
tickets < 1 s): met with a wide margin locally, including at a simulated 10 ms database round trip.
The concurrent run is not a target measurement: it pushes 200 buyers through a single process with 5
connections, which production doesn't do.

**Why does a 2-statement hold take ~47 ms at a 10 ms round trip?** Each statement costs about two
network round trips, because the database client (postgres.js with
`prepare: false`, required for poolers that don't support prepared statements) asks Postgres to
describe every parameterised query before running it. So a hold is 2 statements ≈ 4 round trips ≈
47 ms at 10 ms each. This is why cutting statements matters so much more than shaving CPU.

## What decides speed in production

The biggest real-world factor is the distance between the Vercel functions (`vercel.json` → `"regions":
["sin1"]`, Singapore) and the Neon database. A hold now costs about 4 network round trips to the
database, a checkout about 8 plus the gateway, a payment about 16. At 2 ms each (same region) that is
nothing; at 70 ms each (e.g. Singapore → US East) a hold alone takes ~300 ms and payment → tickets
over a second.

**Check it:** open <https://ticketrush-ten.vercel.app/api/health> in a browser and look at `latencyMs`
(one database round trip, measured after warming the connection) and `region` (the Vercel region
that served it).

- **Below ~20 ms:** the function and database are close. Nothing to do.
- **Above ~20 ms:** the Neon project is probably in a different region from the functions. Find
  Neon's region in the Neon Console: it's shown on the project's dashboard and under the project's
  settings, and it's also part of the connection-string host (e.g. `….ap-southeast-1.aws.neon.tech`
  is Singapore, `….us-east-1.aws.neon.tech` is N. Virginia). Then either
  - move the database to **AWS Asia Pacific (Singapore)**, `ap-southeast-1`: a Neon project's region
    is fixed at creation, so create a new project there, update `DATABASE_URL` in Vercel and
    redeploy (the build migrates and seeds it); or
  - point the functions at Neon instead: set `"regions"` in `vercel.json` to the Vercel region next
    to Neon's, e.g. `iad1` for `us-east-1`, `fra1` for `eu-central-1`, `bom1` for `ap-south-1`
    (Mumbai), `syd1` for `ap-southeast-2`.

## Reproduce

```bash
# local Postgres on :5433 with the schema migrated and seeded, then a production build
npm run build && DATABASE_URL=postgres://postgres@localhost:5433/ticketrush npx next start -p 3000
BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres@localhost:5433/ticketrush npx tsx scripts/bench-flow.ts 200
# simulated network distance: proxy :5434 → :5433 with 5 ms each way, and point the app at :5434
node scripts/latency-proxy.mjs 5434 5433 5
```

The bench script refuses to run against anything but a local database because it deletes orders.

## Update 2026-11-10: region mismatch found and fixed

`/api/health` on production showed the functions in `sin1` (Singapore) but the Neon database in
`us-east-1`: every query cost about 220 ms. Functions now run in `iad1` (same AWS region as the
database). Public pages (`/`, `/events`, `/how-it-works`) are now served from the CDN cache instead
of rendering per request.
