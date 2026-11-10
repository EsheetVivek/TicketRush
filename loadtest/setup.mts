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
// The drop opens now. Burst is raised so the test measures checkout under load; the waiting
// room's own fairness is covered separately (m5-waiting-room.md).
await sql`update events set on_sale_at = now(), status = 'on_sale', queue_burst = 100000 where id = ${SEED_EVENTS[0].id}`;
writeFileSync("loadtest/.tokens.json", JSON.stringify(sessions.map((s) => s.session_token)));
console.log(`created ${n} buyers with sessions; drop open for ${SEED_EVENTS[0].title}`);
await sql.end();
