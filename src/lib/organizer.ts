import { and, eq, lte, sql } from "drizzle-orm";
import type { Session } from "next-auth";
import { auditLog, events, queueEntries, seatHolds } from "@/db/schema";
import { admittedCount } from "@/lib/queue";
import type { db as DBType } from "@/db";

type DB = typeof DBType;

/**
 * Organizers are listed by email in ORGANIZER_EMAILS (comma-separated). Checked on the server for
 * every organizer page and API call; buyers get a 404 so the area isn't even discoverable.
 */
export function isOrganizer(session: Session | null, list = process.env.ORGANIZER_EMAILS ?? ""): boolean {
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return false;
  return list.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email);
}

export interface EventStats {
  id: string; title: string; venue: string; status: string; startsAt: Date; onSaleAt: Date;
  queueEnabled: boolean; seats: number; sold: number; held: number; available: number;
  revenueCents: number; refunds: number; refundedCents: number; pendingOrders: number;
  queueJoined: number; queueAdmitted: number;
}

/** One query per dashboard load: per-event seat, money, refund and queue numbers. */
export async function eventStats(db: DB, now = new Date()): Promise<EventStats[]> {
  const rows = await db.execute<{
    id: string; title: string; venue: string; status: string; starts_at: Date; on_sale_at: Date; queue_enabled: boolean;
    queue_rate_per_min: number; queue_burst: number; seats: number; sold: number; held: number;
    revenue_cents: number; refunds: number; refunded_cents: number; pending_orders: number; queue_joined: number;
  }>(sql`
    select e.id, e.title, e.venue, e.status, e.starts_at, e.on_sale_at, e.queue_enabled, e.queue_rate_per_min, e.queue_burst,
      (select count(*)::int from seats s where s.event_id = e.id) as seats,
      (select count(*)::int from tickets t where t.event_id = e.id) as sold,
      (select count(*)::int from seat_holds h where h.event_id = e.id and h.expires_at > ${now.toISOString()}::timestamp) as held,
      (select coalesce(sum(o.amount_cents), 0)::int from orders o where o.event_id = e.id and o.status = 'ticketed') as revenue_cents,
      (select count(*)::int from orders o where o.event_id = e.id and o.status in ('refund_pending', 'refunded')) as refunds,
      (select coalesce(sum(o.amount_cents), 0)::int from orders o where o.event_id = e.id and o.status = 'refunded') as refunded_cents,
      (select count(*)::int from orders o where o.event_id = e.id and o.status in ('pending', 'paid')) as pending_orders,
      (select count(*)::int from queue_entries q where q.event_id = e.id) as queue_joined
    from events e order by e.starts_at`);
  return rows.map((r) => {
    const onSaleAt = new Date(r.on_sale_at);
    const admitted = r.queue_enabled ? Math.min(r.queue_joined, admittedCount({ onSaleAt, queueRatePerMin: r.queue_rate_per_min, queueBurst: r.queue_burst }, now)) : r.queue_joined;
    return {
      id: r.id, title: r.title, venue: r.venue, status: r.status, startsAt: new Date(r.starts_at), onSaleAt, queueEnabled: r.queue_enabled,
      seats: r.seats, sold: r.sold, held: r.held, available: Math.max(0, r.seats - r.sold - r.held),
      revenueCents: r.revenue_cents, refunds: r.refunds, refundedCents: r.refunded_cents, pendingOrders: r.pending_orders,
      queueJoined: r.queue_joined, queueAdmitted: admitted,
    };
  });
}

export async function recentAudit(db: DB, limit = 25) {
  return db.select().from(auditLog).orderBy(sql`${auditLog.at} desc`).limit(limit);
}

/**
 * Start a new drop: the sale (re)opens now and the waiting room starts empty, so the next wave of
 * buyers is admitted in arrival order from this moment. Sold tickets are never touched; only
 * expired holds are cleared. Recorded in the audit log.
 */
export async function startDrop(db: DB, input: { eventId: string; actorId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [e] = await tx.update(events).set({ onSaleAt: now, status: "on_sale" }).where(eq(events.id, input.eventId)).returning({ id: events.id, queueEnabled: events.queueEnabled });
    if (!e) return null;
    const cleared = await tx.delete(queueEntries).where(eq(queueEntries.eventId, input.eventId)).returning({ u: queueEntries.userId });
    await tx.delete(seatHolds).where(and(eq(seatHolds.eventId, input.eventId), lte(seatHolds.expiresAt, now)));
    await tx.insert(auditLog).values({ actorId: input.actorId, action: "event.drop_started", target: `event:${input.eventId}`, meta: { queueCleared: cleared.length } });
    return { eventId: e.id, queueCleared: cleared.length, onSaleAt: now };
  });
}
