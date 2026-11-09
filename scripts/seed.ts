import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { SEED_EVENTS } from "../src/db/seed-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, ssl: url.includes("localhost") ? false : "require" });
  const db = drizzle(client, { schema });
  for (const e of SEED_EVENTS) {
    await db.insert(schema.events).values({
      id: e.id, title: e.title, venue: e.venue, startsAt: e.startsAt, onSaleAt: new Date("2026-11-01T00:00:00Z"), status: "on_sale",
    }).onConflictDoNothing();
    const rows = e.sections.flatMap((s) => [...s.rows].flatMap((row) =>
      Array.from({ length: s.perRow }, (_, i) => ({ eventId: e.id, section: s.name, row, number: i + 1, priceCents: s.priceCents }))));
    await db.insert(schema.seats).values(rows).onConflictDoNothing();
    console.log(`seeded ${e.title}: ${rows.length} seats`);
  }
  await client.end();
}
main().catch((err) => { console.error(err); process.exit(1); });
