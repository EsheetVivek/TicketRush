import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { events, queueEntries, seatHolds, seats, tickets } from "@/db/schema";

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

/** A uuid[] literal built from bound parameters (never string-interpolated). */
export const uuidArray = (ids: string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

const ts = (d: Date) => sql`${d.toISOString()}::timestamp`;

/**
 * Atomically hold a set of seats for one buyer. All-or-nothing: if any seat is sold, held by
 * someone else, or not part of this event, no seat is held. A buyer has at most one active hold
 * per event; placing a new hold releases their previous one.
 *
 * Speed: everything (waiting-room admission, event status, seat validation, sold check, releasing
 * the buyer's previous hold and expired holds, and the insert) runs as ONE SQL statement, so a
 * hold costs a single database round trip. A single statement is atomic on its own: if any insert
 * hits the seat_holds primary key (someone else holds the seat), the whole statement, including
 * the deletes, is rolled back. Seats are inserted in a fixed (sorted) order so two buyers racing
 * for overlapping seats queue behind each other instead of deadlocking.
 *
 * Correctness does not depend on application-level checks racing correctly: seat_holds.seat_id is
 * a primary key, so two concurrent statements can never both hold the same seat.
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
  const sorted = [...seatIds].sort();
  const want = uuidArray(sorted);
  const n = sorted.length;

  type Row = {
    found: boolean; status: string | null; queue_enabled: boolean | null; joined: boolean; admitted: boolean;
    valid_ids: string[]; sold_ids: string[]; inserted: number;
  };
  let row: Row;
  try {
    // Waiting room is enforced here on the server (same formula as queue.ts admittedCount), so
    // nobody can skip the line by calling the API directly.
    const rows = await db.execute<Row>(sql`
      with e as (
        select status, queue_enabled, on_sale_at, queue_rate_per_min, queue_burst from ${events} where id = ${input.eventId}
      ), me as (
        select position from ${queueEntries} where event_id = ${input.eventId} and user_id = ${input.userId}
      ), gate as (
        select
          (select count(*) from e) = 1 as found,
          coalesce((select not queue_enabled from e), true)
            or (exists (select 1 from me) and
                (select count(*) from ${queueEntries} q where q.event_id = ${input.eventId} and q.position <= (select position from me))
                <= (select queue_burst + floor(greatest(0, extract(epoch from (${ts(now)} - on_sale_at)) * 1000) / 60000 * queue_rate_per_min) from e)
            ) as admitted
      ), valid as (
        select s.id from ${seats} s where s.event_id = ${input.eventId} and s.id = any(${want})
      ), sold as (
        select t.seat_id from ${tickets} t where t.event_id = ${input.eventId} and t.seat_id = any(${want})
      ), ok as (
        select g.admitted and g.found and (select status from e) = 'on_sale'
          and (select count(*) from valid) = ${n} and not exists (select 1 from sold) as go
        from gate g
      ), released as (
        delete from ${seatHolds}
        where (select go from ok)
          and ((holder_id = ${input.userId} and event_id = ${input.eventId}) or (seat_id = any(${want}) and expires_at < ${ts(now)}))
        returning seat_id
      ), ins as (
        insert into ${seatHolds} (seat_id, event_id, holder_id, hold_token, expires_at)
        select w.id, ${input.eventId}, ${input.userId}, ${holdToken}, ${ts(expiresAt)}
        from unnest(${want}) with ordinality as w(id, ord)
        where (select go from ok) and (select count(*) from released) >= 0
        order by w.ord
        returning seat_id
      )
      select g.found, (select status from e) as status, (select queue_enabled from e) as queue_enabled,
        exists (select 1 from me) as joined, g.admitted,
        array(select id::text from valid) as valid_ids, array(select seat_id::text from sold) as sold_ids,
        (select count(*)::int from ins) as inserted
      from gate g`);
    row = rows[0];
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    // 23505: another buyer holds one of these seats. 40P01: two buyers grabbed overlapping seats at
    // the same instant and Postgres picked this one to back off. Either way nothing was held.
    if (code === "23505" || code === "40P01") {
      const taken = await db.select({ id: seatHolds.seatId }).from(seatHolds)
        .where(and(inArray(seatHolds.seatId, seatIds), gt(seatHolds.expiresAt, now)));
      const others = taken.map((t) => t.id);
      throw new HoldError("HELD", "Someone else is holding some of these seats.", others.length ? seatIds.filter((id) => others.includes(id)) : seatIds);
    }
    throw e;
  }

  if (!row.admitted) {
    throw new HoldError("QUEUE", row.joined ? "You're still in the waiting room." : "Join the waiting room first.");
  }
  if (!row.found || row.status !== "on_sale") throw new HoldError("NOT_ON_SALE", "This event isn't on sale.");
  if (row.valid_ids.length !== n) {
    const ok = new Set(row.valid_ids);
    throw new HoldError("INVALID_SEATS", "Some seats don't belong to this event.", seatIds.filter((id) => !ok.has(id)));
  }
  if (row.sold_ids.length) throw new HoldError("SOLD", "Some seats are already sold.", row.sold_ids);
  if (row.inserted !== n) throw new HoldError("HELD", "Someone else is holding some of these seats.", seatIds);
  return { holdToken, eventId: input.eventId, seatIds, expiresAt };
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
      exists(select 1 from ${tickets} t where t.event_id = s.event_id and t.seat_id = s.id) as sold,
      exists(select 1 from ${seatHolds} h where h.seat_id = s.id and h.expires_at > ${now.toISOString()}::timestamp) as held
    from ${seats} s where s.event_id = ${eventId}
    order by s.price_cents desc, s.row, s.number`);
  return rows.map((r) => ({
    id: r.id, section: r.section, row: r.row, number: r.number, priceCents: r.price_cents,
    status: r.sold ? "sold" : r.held ? "held" : "available",
  }));
}
