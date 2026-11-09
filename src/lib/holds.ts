import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { events, seatHolds, seats, tickets } from "@/db/schema";
import { queueStatus } from "@/lib/queue";

type DB = PostgresJsDatabase<typeof schema>;

export const MAX_SEATS_PER_HOLD = 6;
export const HOLD_TTL_SECONDS = 600;

export type HoldErrorCode = "INVALID_REQUEST" | "INVALID_SEATS" | "NOT_ON_SALE" | "SOLD" | "HELD" | "QUEUE";

export class HoldError extends Error {
  constructor(public code: HoldErrorCode, message: string, public seatIds: string[] = []) {
    super(message);
  }
}

export interface Hold {
  holdToken: string;
  eventId: string;
  seatIds: string[];
  expiresAt: Date;
}

/**
 * Atomically hold a set of seats for one buyer. All-or-nothing: if any seat is sold, held by
 * someone else, or not part of this event, no seat is held. A buyer has at most one active hold
 * per event; placing a new hold releases their previous one.
 *
 * Correctness does not depend on application-level checks racing correctly: seat_holds.seat_id is
 * a primary key, so two concurrent transactions can never both hold the same seat.
 */
export async function acquireHold(
  db: DB,
  input: { userId: string; eventId: string; seatIds: string[]; ttlSeconds?: number; now?: Date },
): Promise<Hold> {
  const seatIds = [...new Set(input.seatIds)];
  if (seatIds.length === 0 || seatIds.length > MAX_SEATS_PER_HOLD) {
    throw new HoldError("INVALID_REQUEST", `Choose between 1 and ${MAX_SEATS_PER_HOLD} seats.`);
  }
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlSeconds ?? HOLD_TTL_SECONDS) * 1000);
  const holdToken = crypto.randomUUID();

  // Waiting room is enforced here on the server, so nobody can skip the line by calling the API directly.
  const q = await queueStatus(db, { eventId: input.eventId, userId: input.userId, now });
  if (!q.admitted) throw new HoldError("QUEUE", q.joined ? "You're still in the waiting room." : "Join the waiting room first.");

  return db.transaction(async (tx) => {
    const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, input.eventId));
    if (!event || event.status !== "on_sale") throw new HoldError("NOT_ON_SALE", "This event isn't on sale.");

    // Seats must exist and belong to this event (blocks mixing in seat IDs from other events).
    const valid = await tx.select({ id: seats.id }).from(seats)
      .where(and(eq(seats.eventId, input.eventId), inArray(seats.id, seatIds)));
    if (valid.length !== seatIds.length) {
      const ok = new Set(valid.map((s) => s.id));
      throw new HoldError("INVALID_SEATS", "Some seats don't belong to this event.", seatIds.filter((id) => !ok.has(id)));
    }

    const sold = await tx.select({ id: tickets.seatId }).from(tickets)
      .where(and(eq(tickets.eventId, input.eventId), inArray(tickets.seatId, seatIds)));
    if (sold.length) throw new HoldError("SOLD", "Some seats are already sold.", sold.map((s) => s.id));

    // Release this buyer's previous hold for the event, and clear expired holds on the requested seats.
    await tx.delete(seatHolds).where(and(eq(seatHolds.holderId, input.userId), eq(seatHolds.eventId, input.eventId)));
    await tx.delete(seatHolds).where(and(inArray(seatHolds.seatId, seatIds), lt(seatHolds.expiresAt, now)));

    const inserted = await tx.insert(seatHolds)
      .values(seatIds.map((seatId) => ({ seatId, eventId: input.eventId, holderId: input.userId, holdToken, expiresAt })))
      .onConflictDoNothing({ target: seatHolds.seatId })
      .returning({ seatId: seatHolds.seatId });

    if (inserted.length !== seatIds.length) {
      const got = new Set(inserted.map((r) => r.seatId));
      // Throwing rolls back the whole transaction, including the seats we did insert.
      throw new HoldError("HELD", "Someone else is holding some of these seats.", seatIds.filter((id) => !got.has(id)));
    }
    return { holdToken, eventId: input.eventId, seatIds, expiresAt };
  });
}

export async function releaseHold(db: DB, input: { userId: string; eventId: string }): Promise<number> {
  const rows = await db.delete(seatHolds)
    .where(and(eq(seatHolds.holderId, input.userId), eq(seatHolds.eventId, input.eventId)))
    .returning({ seatId: seatHolds.seatId });
  return rows.length;
}

export async function getMyHold(db: DB, input: { userId: string; eventId: string; now?: Date }): Promise<Hold | null> {
  const rows = await db.select().from(seatHolds).where(and(
    eq(seatHolds.holderId, input.userId), eq(seatHolds.eventId, input.eventId), gt(seatHolds.expiresAt, input.now ?? new Date()),
  ));
  if (!rows.length) return null;
  return { holdToken: rows[0].holdToken, eventId: input.eventId, seatIds: rows.map((r) => r.seatId), expiresAt: rows[0].expiresAt };
}

export type SeatStatus = "available" | "held" | "sold";
export interface SeatView { id: string; section: string; row: string; number: number; priceCents: number; status: SeatStatus }

/** Public availability snapshot. Contains no information about who holds a seat. */
export async function getSeatMap(db: DB, eventId: string, now = new Date()): Promise<SeatView[]> {
  const rows = await db.execute<{ id: string; section: string; row: string; number: number; price_cents: number; sold: boolean; held: boolean }>(sql`
    select s.id, s.section, s.row, s.number, s.price_cents,
      exists(select 1 from ${tickets} t where t.seat_id = s.id) as sold,
      exists(select 1 from ${seatHolds} h where h.seat_id = s.id and h.expires_at > ${now.toISOString()}::timestamp) as held
    from ${seats} s where s.event_id = ${eventId}
    order by s.price_cents desc, s.row, s.number`);
  return rows.map((r) => ({
    id: r.id, section: r.section, row: r.row, number: r.number, priceCents: r.price_cents,
    status: r.sold ? "sold" : r.held ? "held" : "available",
  }));
}
