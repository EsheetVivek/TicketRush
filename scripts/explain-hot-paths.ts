/**
 * Prints the query plan of every hot-path query with sequential scans disabled, so a missing index
 * shows up as a "Seq Scan" line. Local databases only.
 *   DATABASE_URL=postgres://postgres@localhost:5433/ticketrush npx tsx scripts/explain-hot-paths.ts
 */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const E = "6f1c1d0e-5a3b-4c55-9a0e-6b2d1e000001";
const U = "explain-user";
const S = "00000000-0000-0000-0000-000000000001";
const O = "00000000-0000-0000-0000-000000000002";
const Q: Record<string, string> = {
  session: `select * from sessions s join users u on u.id = s.user_id where s.session_token = 'x'`,
  "hold: queue rank": `select count(*) from queue_entries q where q.event_id = '${E}' and q.position <= 10`,
  "hold: my queue entry": `select position from queue_entries where event_id = '${E}' and user_id = '${U}'`,
  "hold: seats valid": `select id from seats where event_id = '${E}' and id = any(array['${S}']::uuid[])`,
  "hold: sold": `select seat_id from tickets where event_id = '${E}' and seat_id = any(array['${S}']::uuid[])`,
  "hold: release mine": `select 1 from seat_holds where holder_id = '${U}' and event_id = '${E}'`,
  "hold: expired on seats": `select 1 from seat_holds where seat_id = any(array['${S}']::uuid[]) and expires_at < now()`,
  "checkout: by idem key": `select * from orders where idem_key = 'k'`,
  "checkout: my live hold": `select seat_id from seat_holds where holder_id = '${U}' and event_id = '${E}' and expires_at > now()`,
  "pay: order by gateway ref": `select * from orders where gateway_ref = 'r'`,
  "pay: order items": `select seat_id from order_items where order_id = '${O}'`,
  "pay: webhook dedupe": `select 1 from payment_events where gateway_event_id = 'e'`,
  "mock: by idem key": `select ref from mock_payments where idem_key = 'k'`,
  "seat map": `select s.id, exists(select 1 from tickets t where t.event_id = s.event_id and t.seat_id = s.id), exists(select 1 from seat_holds h where h.seat_id = s.id and h.expires_at > now()) from seats s where s.event_id = '${E}'`,
  "order page: tickets": `select * from tickets where order_id = '${O}'`,
  "history: my orders": `select * from orders where user_id = '${U}' order by created_at desc limit 20`,
};
async function main() {
  await sql`set enable_seqscan = off`;
  let missing = 0;
  for (const [name, q] of Object.entries(Q)) {
    const plan = (await sql.unsafe(`explain ${q}`)).map((r) => r["QUERY PLAN"]).join("\n");
    const seq = /Seq Scan/.test(plan);
    if (seq) missing++;
    console.log(`${seq ? "SEQ " : "ok  "} ${name}\n${plan.split("\n").map((l) => "      " + l).join("\n")}`);
  }
  console.log(missing ? `${missing} queries without an index` : "every hot query uses an index");
  await sql.end();
}
main();
