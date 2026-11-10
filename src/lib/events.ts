import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { events } from "@/db/schema";

type DB = PostgresJsDatabase<typeof schema>;

export interface EventCard { id: string; title: string; venue: string; startsAt: Date; status: string; total: number; sold: number; fromCents: number; queue: boolean }

/** Events that are on sale or sold out, soonest first, with seats left and the lowest price. */
export async function listEvents(db: DB, limit = 50): Promise<EventCard[]> {
  const rows = await db.execute<{ id: string; title: string; venue: string; starts_at: string; status: string; total: number; sold: number; from_cents: number; queue_enabled: boolean }>(sql`
    select e.id, e.title, e.venue, e.starts_at, e.status, e.queue_enabled,
      (select count(*)::int from seats s where s.event_id = e.id) as total,
      (select count(*)::int from tickets t where t.event_id = e.id) as sold,
      (select min(price_cents)::int from seats s where s.event_id = e.id) as from_cents
    from ${events} e where e.status in ('on_sale','sold_out') order by e.starts_at limit ${limit}`);
  return rows.map((r) => ({
    id: r.id, title: r.title, venue: r.venue, startsAt: new Date(`${String(r.starts_at).replace(" ", "T")}Z`), status: r.status,
    total: r.total, sold: r.sold, fromCents: r.from_cents, queue: r.queue_enabled,
  }));
}
