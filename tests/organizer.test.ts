import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { eventStats, isOrganizer, startDrop } from "@/lib/organizer";
import { faultsFromEnv } from "@/lib/payments";
import { SEED_EVENTS } from "@/db/seed-data";
import type { Session } from "next-auth";

const s = (email?: string) => ({ user: { email }, expires: "" }) as Session;

describe("organizer access", () => {
  it("only lists organizers by exact email, case-insensitively", () => {
    expect(isOrganizer(s("Boss@Example.com"), "boss@example.com, ops@example.com")).toBe(true);
    expect(isOrganizer(s("someone@example.com"), "boss@example.com")).toBe(false);
    expect(isOrganizer(s("boss@example.com"), "")).toBe(false);
    expect(isOrganizer(s(undefined), "boss@example.com")).toBe(false);
    expect(isOrganizer(null, "boss@example.com")).toBe(false);
  });
});

describe("fault injection config", () => {
  it("parses MOCK_FAULTS and is ignored on production", () => {
    expect(faultsFromEnv("failBefore=0.05,failAfter=0.1,dropWebhook=0.2,latencyMs=150", "preview")).toEqual({ failBefore: 0.05, failAfter: 0.1, dropWebhook: 0.2, latencyMs: 150 });
    expect(faultsFromEnv("failBefore=0.5", "production")).toEqual({});
    expect(faultsFromEnv("failBefore=7,latencyMs=-3,junk=1", undefined)).toEqual({ failBefore: 1 });
  });
});

const url = process.env.DATABASE_URL;
(url ? describe : describe.skip)("start a drop", () => {
  const client = postgres(url ?? "", { max: 2, ssl: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const CONCERT = SEED_EVENTS[0].id;
  afterAll(async () => { await db.execute(sql`delete from users where email like '%@drop.test'`); await client.end(); });

  it("reopens the sale now, empties the waiting room, keeps tickets and logs it", async () => {
    await db.insert(schema.users).values([{ id: "drop-1", email: "1@drop.test" }, { id: "drop-2", email: "2@drop.test" }]).onConflictDoNothing();
    await db.insert(schema.queueEntries).values([{ eventId: CONCERT, userId: "drop-1" }, { eventId: CONCERT, userId: "drop-2" }]).onConflictDoNothing();
    const ticketsBefore = (await db.select().from(schema.tickets).where(eq(schema.tickets.eventId, CONCERT))).length;
    const now = new Date();
    const r = await startDrop(db, { eventId: CONCERT, actorId: "drop-1", now });
    expect(r?.queueCleared).toBeGreaterThanOrEqual(2);
    expect((await db.select().from(schema.queueEntries).where(eq(schema.queueEntries.eventId, CONCERT))).length).toBe(0);
    expect((await db.select().from(schema.tickets).where(eq(schema.tickets.eventId, CONCERT))).length).toBe(ticketsBefore);
    const [e] = await db.select().from(schema.events).where(eq(schema.events.id, CONCERT));
    expect(e.onSaleAt.getTime()).toBe(now.getTime());
    const [log] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "event.drop_started")).orderBy(sql`at desc`).limit(1);
    expect(log.target).toBe(`event:${CONCERT}`);
    const stats = await eventStats(db);
    const c = stats.find((x) => x.id === CONCERT)!;
    expect(c.seats).toBe(500);
    expect(c.sold + c.held + c.available).toBe(500);
  });

  it("returns null for an unknown event", async () => {
    expect(await startDrop(db, { eventId: "00000000-0000-4000-8000-000000000000", actorId: "drop-1" })).toBeNull();
  });
});
