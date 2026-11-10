/**
 * Counts database round trips per API call by reading the local Postgres statement log
 * (requires log_statement = 'all'). LOCAL ONLY.
 *   PG_LOG=/path/to/postgres.log BASE_URL=http://localhost:3000 DATABASE_URL=... npx tsx scripts/count-roundtrips.ts
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOG = process.env.PG_LOG!;
const EVENT = "6f1c1d0e-5a3b-4c55-9a0e-6b2d1e000001";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const lines = () => readFileSync(LOG, "utf8").split("\n").filter((l) => /LOG:\s+(statement|execute)/.test(l));

async function main() {
  const id = `rt-${Date.now()}`, token = randomUUID();
  await sql`insert into users (id, email) values (${id}, ${id + "@bench.local"})`;
  await sql`insert into sessions (session_token, user_id, expires) values (${token}, ${id}, ${new Date(Date.now() + 3600_000)})`;
  const [seat] = await sql`select s.id from seats s where s.event_id = ${EVENT} and not exists (select 1 from tickets t where t.seat_id = s.id) and not exists (select 1 from seat_holds h where h.seat_id = s.id) limit 1`;
  const headers = { "Content-Type": "application/json", Origin: BASE, Cookie: `authjs.session-token=${token}`, "x-forwarded-for": "10.7.0.1" };
  const post = (p: string, b?: unknown) => fetch(BASE + p, { method: "POST", headers, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
  await post(`/api/queue/${EVENT}`);
  await new Promise((r) => setTimeout(r, 300));
  const counts: Record<string, number> = {};
  let orderId = "";
  for (const [name, fn] of [
    ["seats", () => fetch(`${BASE}/api/events/${EVENT}/seats`).then((r) => r.json())],
    ["hold", () => post("/api/holds", { eventId: EVENT, seatIds: [seat.id] })],
    ["checkout", async () => { const c = await post("/api/checkout", { eventId: EVENT, idemKey: randomUUID() }); orderId = c.orderId; return c; }],
    ["pay", () => post("/api/mock-pay", { orderId })],
  ] as const) {
    const before = lines().length;
    await fn();
    await new Promise((r) => setTimeout(r, 300)); // let the log flush
    counts[name] = lines().length - before;
  }
  console.log(JSON.stringify(counts));
  // clean up what this run created
  await sql`delete from tickets where order_id = ${orderId}`; await sql`delete from order_items where order_id = ${orderId}`;
  await sql`delete from orders where id = ${orderId}`; await sql`delete from seat_holds where holder_id = ${id}`;
  await sql`delete from queue_entries where user_id = ${id}`; await sql`delete from sessions where user_id = ${id}`; await sql`delete from users where id = ${id}`;
  await sql.end();
}
main();
