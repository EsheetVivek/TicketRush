import { and, eq, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { events, queueEntries } from "@/db/schema";

type DB = PostgresJsDatabase<typeof schema>;

export interface QueueStatus {
  enabled: boolean;
  joined: boolean;
  admitted: boolean;
  rank: number | null; // 1 = first in line
  ahead: number;
  etaSeconds: number;
}

/** How many people are admitted at time `now`: an initial burst, then a steady rate from the on-sale time. */
export function admittedCount(e: { onSaleAt: Date; queueRatePerMin: number; queueBurst: number }, now: Date): number {
  const minutes = Math.max(0, (now.getTime() - e.onSaleAt.getTime()) / 60_000);
  return e.queueBurst + Math.floor(minutes * e.queueRatePerMin);
}

/** Join the line. Idempotent: rejoining keeps your original place. */
export async function joinQueue(db: DB, input: { eventId: string; userId: string; now?: Date }): Promise<QueueStatus> {
  await db.insert(queueEntries).values({ eventId: input.eventId, userId: input.userId }).onConflictDoNothing();
  return queueStatus(db, input);
}

export async function queueStatus(db: DB, input: { eventId: string; userId: string; now?: Date }): Promise<QueueStatus> {
  const now = input.now ?? new Date();
  const [e] = await db.select().from(events).where(eq(events.id, input.eventId));
  if (!e || !e.queueEnabled) return { enabled: false, joined: false, admitted: true, rank: null, ahead: 0, etaSeconds: 0 };

  const [mine] = await db.select({ position: queueEntries.position }).from(queueEntries)
    .where(and(eq(queueEntries.eventId, input.eventId), eq(queueEntries.userId, input.userId)));
  if (!mine) return { enabled: true, joined: false, admitted: false, rank: null, ahead: 0, etaSeconds: 0 };

  const [{ rank }] = await db.select({ rank: sql<number>`count(*)::int` }).from(queueEntries)
    .where(and(eq(queueEntries.eventId, input.eventId), lte(queueEntries.position, mine.position)));
  const admitted = admittedCount(e, now);
  const waiting = Math.max(0, rank - admitted);
  return {
    enabled: true, joined: true, admitted: rank <= admitted, rank, ahead: waiting,
    etaSeconds: waiting === 0 ? 0 : Math.ceil((waiting / e.queueRatePerMin) * 60),
  };
}
