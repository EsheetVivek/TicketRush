import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { joinQueue, queueStatus, admittedCount } from "@/lib/queue";
import { acquireHold } from "@/lib/holds";
import { SEED_EVENTS } from "@/db/seed-data";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const EVENT = SEED_EVENTS[0].id; // queue enabled

run("waiting room", () => {
  const client = postgres(url ?? "", { max: 40, ssl: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  let opened: Date;
  let seatId = "";
  const users = async (n: number, p: string) => {
    const rows = Array.from({ length: n }, (_, i) => ({ id: `${p}-${i}`, email: `${p}-${i}@test.local` }));
    for (let i = 0; i < rows.length; i += 1000) await db.insert(schema.users).values(rows.slice(i, i + 1000)).onConflictDoNothing();
    return rows.map((r) => r.id);
  };
  beforeAll(async () => {
    opened = new Date();
    await db.update(schema.events).set({ onSaleAt: opened, queueBurst: 100, queueRatePerMin: 300, queueEnabled: true }).where(eq(schema.events.id, EVENT));
    seatId = (await db.select().from(schema.seats).where(eq(schema.seats.eventId, EVENT)).limit(1))[0].id;
  });
  beforeEach(async () => { await db.execute(sql`delete from queue_entries; delete from seat_holds;`); });
  afterAll(async () => {
    await db.execute(sql`delete from queue_entries; delete from seat_holds;`);
    await db.update(schema.events).set({ onSaleAt: new Date("2026-11-01T00:00:00Z") }).where(eq(schema.events.id, EVENT));
    await db.execute(sql`delete from users where email like '%@test.local'`);
    await client.end();
  });

  it("admits a burst at once, then a steady rate", () => {
    const e = { onSaleAt: new Date(0), queueRatePerMin: 300, queueBurst: 100 };
    expect(admittedCount(e, new Date(0))).toBe(100);
    expect(admittedCount(e, new Date(60_000))).toBe(400);
    expect(admittedCount(e, new Date(-5000))).toBe(100);
  });

  it("2,000 people joining at once get unique places; first 100 admitted, the rest wait with an ETA", async () => {
    const ids = await users(2000, "q");
    const res = await Promise.all(ids.map((userId) => joinQueue(db, { eventId: EVENT, userId, now: opened })));
    const ranks = res.map((r) => r.rank!);
    expect(new Set(ranks).size).toBe(2000);
    expect(Math.min(...ranks)).toBe(1);
    expect(Math.max(...ranks)).toBe(2000);
    expect(res.filter((r) => r.admitted).length).toBe(100);
    const last = res.find((r) => r.rank === 2000)!;
    expect(last.ahead).toBe(1900);
    expect(last.etaSeconds).toBe(380); // 1,900 people at 300/min
  }, 60_000);

  it("rejoining keeps your place", async () => {
    const [a, b] = await users(2, "rj");
    const first = await joinQueue(db, { eventId: EVENT, userId: a });
    await joinQueue(db, { eventId: EVENT, userId: b });
    expect((await joinQueue(db, { eventId: EVENT, userId: a })).rank).toBe(first.rank);
  });

  it("cannot hold seats without being admitted, even by calling the API directly", async () => {
    const ids = await users(150, "skip");
    for (const id of ids) await joinQueue(db, { eventId: EVENT, userId: id, now: opened });
    const notYet = ids[149];
    expect((await queueStatus(db, { eventId: EVENT, userId: notYet, now: opened })).admitted).toBe(false);
    await expect(acquireHold(db, { userId: notYet, eventId: EVENT, seatIds: [seatId], now: opened })).rejects.toMatchObject({ code: "QUEUE" });
    const [never] = await users(1, "never");
    await expect(acquireHold(db, { userId: never, eventId: EVENT, seatIds: [seatId] })).rejects.toMatchObject({ code: "QUEUE" });
    // ten seconds later, 50 more people are admitted
    const later = new Date(opened.getTime() + 10_000);
    expect((await queueStatus(db, { eventId: EVENT, userId: notYet, now: later })).admitted).toBe(true);
    await expect(acquireHold(db, { userId: notYet, eventId: EVENT, seatIds: [seatId], now: later })).resolves.toBeTruthy();
  }, 60_000);
});
