/**
 * After the load test: run the reconciler as if 41 minutes had passed (10-minute hold + the 30-minute
 * grace the reconciler gives a pending payment), so abandoned checkouts and lost webhooks are all settled, then check the money and seat invariants directly in Postgres.
 * Writes loadtest/verify.json and exits non-zero if any invariant fails.
 */
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { gateway } from "../src/lib/payments/index.ts";
import { reconcile } from "../src/lib/reconcile.ts";
import { SEED_EVENTS } from "../src/db/seed-data.ts";

const EVENT = SEED_EVENTS[0].id;
const q = async <T>(s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as T[];

const report = await reconcile(db, gateway(), new Date(Date.now() + 41 * 60_000));
const [counts] = await q<Record<string, number>>(sql`
  select
    (select count(*)::int from seats where event_id = ${EVENT}) as seats,
    (select count(*)::int from tickets where event_id = ${EVENT}) as tickets,
    (select count(distinct seat_id)::int from tickets where event_id = ${EVENT}) as distinct_ticket_seats,
    (select count(*)::int from orders where event_id = ${EVENT}) as orders,
    (select count(*)::int from orders where event_id = ${EVENT} and status = 'ticketed') as ticketed,
    (select count(*)::int from orders where event_id = ${EVENT} and status = 'refunded') as refunded,
    (select count(*)::int from orders where event_id = ${EVENT} and status = 'refund_pending') as refund_pending,
    (select count(*)::int from orders where event_id = ${EVENT} and status in ('pending','paid')) as unsettled,
    (select count(*)::int from orders where event_id = ${EVENT} and status = 'expired') as expired,
    (select count(*)::int from mock_payments where status = 'succeeded') as charged,
    -- charged, but the order is neither ticketed nor refunded: the failure G2 forbids
    (select count(*)::int from mock_payments p join orders o on o.gateway_ref = p.ref
       where p.status = 'succeeded' and o.status not in ('ticketed','refunded','refund_pending')) as orphan_charges,
    -- ticketed without a successful charge
    (select count(*)::int from orders o where o.event_id = ${EVENT} and o.status = 'ticketed'
       and not exists (select 1 from mock_payments p where p.ref = o.gateway_ref and p.status in ('succeeded','refunded'))) as unpaid_tickets
`);

const checks = {
  noSeatSoldTwice: counts.tickets === counts.distinct_ticket_seats,
  neverOversold: counts.tickets <= counts.seats,
  noOrphanCharges: counts.orphan_charges === 0,
  noUnpaidTickets: counts.unpaid_tickets === 0,
  noUnsettledOrders: counts.unsettled === 0,
};
const out = { reconcile: report, counts, checks, ok: Object.values(checks).every(Boolean) };
writeFileSync("loadtest/verify.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
