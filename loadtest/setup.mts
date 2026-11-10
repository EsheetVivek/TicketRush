/**
 * Load-test setup: creates N buyers with live sessions (exactly what a signed-in browser presents)
 * and opens the big drop. Writes the session tokens to loadtest/.tokens.json for k6.
 * Run against a throwaway database only.  Usage: tsx loadtest/setup.ts 3000
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { SEED_EVENTS } from "../src/db/seed-data.ts";

const n = Number(process.argv[2] ?? 3000);
const url = process.env.DATABASE_URL!;
if (!url.includes("localhost")) throw new Error("Refusing to run load-test setup against a non-local database.");
const sql = postgres(url, { max: 4 });

const users = Array.from({ length: n }, (_, i) => ({ id: `lt-${i}`, email: `lt-${i}@load.test`, name: `Buyer ${i}` }));
const sessions = users.map((u) => ({ session_token: randomBytes(24).toString("hex"), user_id: u.id, expires: new Date(Date.now() + 6 * 3600_000) }));

for (let i = 0; i < n; i += 1000) {
  await sql`insert into users ${sql(users.slice(i, i + 1000))} on conflict do nothing`;
  await sql`insert into sessions ${sql(sessions.slice(i, i + 1000))}`;
}
// The drop opens now. QUEUE_BURST / QUEUE_RATE_PER_MIN configure the waiting room for the run:
// a huge burst admits everyone at once (worst case, line bypassed); smaller values meter buyers in
// the way a real drop does.
const burst = Number(process.env.QUEUE_BURST ?? 100000);
const rate = Number(process.env.QUEUE_RATE_PER_MIN ?? 300);
await sql`update events set on_sale_at = ${new Date()}, status = 'on_sale', queue_burst = ${burst}, queue_rate_per_min = ${rate} where id = ${SEED_EVENTS[0].id}`;
// An organizer account; k6 uses it to press "Start a drop" the moment the buyers arrive.
const orgToken = randomBytes(24).toString("hex");
await sql`insert into users (id, email, name) values ('lt-organizer', 'organizer@load.test', 'Organizer') on conflict do nothing`;
await sql`insert into sessions (session_token, user_id, expires) values (${orgToken}, 'lt-organizer', ${new Date(Date.now() + 6 * 3600_000)})`;
writeFileSync("loadtest/.tokens.json", JSON.stringify(sessions.map((s) => s.session_token)));
writeFileSync("loadtest/.organizer.json", JSON.stringify(orgToken));
console.log(`created ${n} buyers with sessions; drop open for ${SEED_EVENTS[0].title}`);
await sql.end();
