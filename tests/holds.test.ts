import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { acquireHold, releaseHold, getMyHold, getSeatMap, HoldError } from "@/lib/holds";
import { SEED_EVENTS } from "@/db/seed-data";

/**
 * Integration tests against a real Postgres (CI service container or local).
 * Skipped when DATABASE_URL isn't set.
 */
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

const CONCERT = SEED_EVENTS[0].id; // 500 seats
const INDIE = SEED_EVENTS[1].id;

run("seat holds", () => {
  const client = postgres(url ?? "", { max: 40, ssl: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  let seatIds: string[] = [];
  let indieSeat = "";

  async function makeUsers(n: number, prefix: string) {
    const rows = Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, email: `${prefix}-${i}@test.local` }));
    for (let i = 0; i < rows.length; i += 1000) await db.insert(schema.users).values(rows.slice(i, i + 1000)).onConflictDoNothing();
    return rows.map((r) => r.id);
  }

  beforeAll(async () => {
    seatIds = (await db.select({ id: schema.seats.id }).from(schema.seats).where(eq(schema.seats.eventId, CONCERT))).map((s) => s.id);
    indieSeat = (await db.select({ id: schema.seats.id }).from(schema.seats).where(eq(schema.seats.eventId, INDIE)).limit(1))[0].id;
    expect(seatIds.length).toBe(500);
    // These tests are about holds, not the waiting room (covered in queue.test.ts).
    await db.update(schema.events).set({ queueEnabled: false }).where(eq(schema.events.id, CONCERT));
  });
  beforeEach(async () => { await db.execute(sql`delete from seat_holds`); });
  afterAll(async () => {
    await db.update(schema.events).set({ queueEnabled: true }).where(eq(schema.events.id, CONCERT));
    await db.execute(sql`delete from seat_holds`);
    await db.execute(sql`delete from users where email like '%@test.local'`);
    await client.end();
  });

  it("holds several seats at once and reports them as held", async () => {
    const [u] = await makeUsers(1, "a");
    const hold = await acquireHold(db, { userId: u, eventId: CONCERT, seatIds: seatIds.slice(0, 3) });
    expect(hold.seatIds).toHaveLength(3);
    const map = await getSeatMap(db, CONCERT);
    expect(map.filter((s) => s.status === "held")).toHaveLength(3);
    expect((await getMyHold(db, { userId: u, eventId: CONCERT }))?.seatIds.sort()).toEqual(seatIds.slice(0, 3).sort());
  });

  it("is all-or-nothing when one seat is already held by someone else", async () => {
    const [a, b] = await makeUsers(2, "b");
    await acquireHold(db, { userId: a, eventId: CONCERT, seatIds: [seatIds[1]] });
    await expect(acquireHold(db, { userId: b, eventId: CONCERT, seatIds: [seatIds[0], seatIds[1], seatIds[2]] }))
      .rejects.toMatchObject({ code: "HELD", seatIds: [seatIds[1]] });
    // Seats 0 and 2 must not have been left held by the failed attempt.
    const map = await getSeatMap(db, CONCERT);
    expect(map.filter((s) => s.status === "held").map((s) => s.id)).toEqual([seatIds[1]]);
  });

  it("rejects seats from another event (tampered request)", async () => {
    const [u] = await makeUsers(1, "c");
    await expect(acquireHold(db, { userId: u, eventId: CONCERT, seatIds: [seatIds[0], indieSeat] }))
      .rejects.toMatchObject({ code: "INVALID_SEATS", seatIds: [indieSeat] });
  });

  it("rejects more than the per-order limit, and empty requests", async () => {
    const [u] = await makeUsers(1, "d");
    await expect(acquireHold(db, { userId: u, eventId: CONCERT, seatIds: seatIds.slice(0, 7) })).rejects.toBeInstanceOf(HoldError);
    await expect(acquireHold(db, { userId: u, eventId: CONCERT, seatIds: [] })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("lets an expired hold be taken by someone else", async () => {
    const [a, b] = await makeUsers(2, "e");
    const past = new Date(Date.now() - 20 * 60 * 1000);
    await acquireHold(db, { userId: a, eventId: CONCERT, seatIds: [seatIds[5]], now: past });
    const hold = await acquireHold(db, { userId: b, eventId: CONCERT, seatIds: [seatIds[5]] });
    expect(hold.seatIds).toEqual([seatIds[5]]);
  });

  it("replaces a buyer's previous hold and can release it", async () => {
    const [u] = await makeUsers(1, "f");
    await acquireHold(db, { userId: u, eventId: CONCERT, seatIds: [seatIds[10]] });
    await acquireHold(db, { userId: u, eventId: CONCERT, seatIds: [seatIds[11]] });
    expect((await getMyHold(db, { userId: u, eventId: CONCERT }))?.seatIds).toEqual([seatIds[11]]);
    expect(await releaseHold(db, { userId: u, eventId: CONCERT })).toBe(1);
    expect(await getMyHold(db, { userId: u, eventId: CONCERT })).toBeNull();
  });

  it("3,000 buyers racing for 500 seats: no seat is ever held twice", async () => {
    const buyers = await makeUsers(3000, "race");
    // Every buyer wants 1–3 seats, heavily overlapping (all aim at the same 500 seats).
    const attempts = buyers.map((userId, i) => {
      const start = (i * 7) % 500;
      const want = [seatIds[start], seatIds[(start + 1) % 500], seatIds[(start + 2) % 500]].slice(0, 1 + (i % 3));
      return acquireHold(db, { userId, eventId: CONCERT, seatIds: want }).then(
        (h) => ({ ok: true as const, seats: h.seatIds }),
        (e) => ({ ok: false as const, code: (e as HoldError).code }),
      );
    });
    const results = await Promise.all(attempts);

    const won = results.flatMap((r) => (r.ok ? r.seats : []));
    expect(new Set(won).size).toBe(won.length); // no seat granted to two buyers
    const rows = await db.select().from(schema.seatHolds);
    expect(rows.length).toBe(won.length); // database agrees with what buyers were told
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "HELD")).toBe(true);
    console.log(`race: ${results.filter((r) => r.ok).length} holds granted, ${won.length} seats held, ${results.filter((r) => !r.ok).length} cleanly rejected`);
  }, 120_000);
});
