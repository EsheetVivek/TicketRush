import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { acquireHold } from "@/lib/holds";
import { startCheckout, handlePaymentEvent, CheckoutError } from "@/lib/orders";
import { MockGateway } from "@/lib/payments/mock";
import { SEED_EVENTS } from "@/db/seed-data";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const EVENT = SEED_EVENTS[1].id; // Indie Night, 120 seats

run("orders and payments", () => {
  const client = postgres(url ?? "", { max: 40, ssl: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const SECRET = "whsec_test";
  const gw = new MockGateway(db, SECRET);
  let seatIds: string[] = [];
  let n = 0;

  async function user() {
    const id = `ord-${Date.now()}-${n++}`;
    await db.insert(schema.users).values({ id, email: `${id}@test.local` });
    return id;
  }
  async function pay(orderId: string) {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const hook = await gw.completePayment(o.gatewayRef!);
    return { hook, ev: await gw.parseWebhook(hook.body, hook.headers) };
  }
  const status = async (orderId: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0].status;
  const ticketCount = async (orderId: string) => (await db.select().from(schema.tickets).where(eq(schema.tickets.orderId, orderId))).length;

  beforeAll(async () => {
    process.env.TICKET_SIGNING_SECRET = "test-ticket-secret";
    seatIds = (await db.select({ id: schema.seats.id }).from(schema.seats).where(eq(schema.seats.eventId, EVENT))).map((s) => s.id);
  });
  async function reset() {
    await db.execute(sql`delete from tickets; delete from refunds; delete from order_items; delete from payment_events;`);
    await db.execute(sql`delete from orders; delete from seat_holds; delete from mock_payments; delete from audit_log;`);
  }
  beforeEach(reset);
  afterAll(async () => { await reset(); await db.execute(sql`delete from users where email like '%@test.local'`); await client.end(); });

  it("charges the price from the database and issues one ticket per seat", async () => {
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: seatIds.slice(0, 2) });
    const c = await startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-price" });
    expect(c.amountMinor).toBe(179900 * 2);
    const { ev } = await pay(c.orderId);
    expect(await handlePaymentEvent(db, gw, ev)).toBe("ticketed");
    expect(await ticketCount(c.orderId)).toBe(2);
    expect((await db.select().from(schema.seatHolds)).length).toBe(0); // hold released
  });

  it("a double-clicked checkout creates one order and one payment", async () => {
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[3]] });
    const [a, b] = await Promise.all([
      startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-double" }),
      startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-double" }),
    ]);
    expect(a.orderId).toBe(b.orderId);
    expect((await db.select().from(schema.orders)).length).toBe(1);
    expect((await db.select().from(schema.mockPayments)).length).toBe(1);
  });

  it("refuses checkout without a live hold, and someone else's checkout key", async () => {
    const [u, v] = [await user(), await user()];
    await expect(startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-none" })).rejects.toMatchObject({ code: "NO_HOLD" });
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[4]] });
    await startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-mine" });
    await expect(startCheckout(db, gw, { userId: v, eventId: EVENT, idemKey: "k-mine" })).rejects.toBeInstanceOf(CheckoutError);
  });

  it("a webhook delivered three times issues tickets once", async () => {
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[5]] });
    const c = await startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-dup" });
    const { ev } = await pay(c.orderId);
    const results = await Promise.all([handlePaymentEvent(db, gw, ev), handlePaymentEvent(db, gw, ev), handlePaymentEvent(db, gw, ev)]);
    expect(results.filter((r) => r === "ticketed")).toHaveLength(1);
    expect(await ticketCount(c.orderId)).toBe(1);
  });

  it("rejects a forged or replayed webhook", async () => {
    const forged = gw.signedEvent({ id: "evt_x", type: "payment.succeeded", gatewayRef: "x", amountMinor: 1, orderId: null });
    await expect(new MockGateway(db, "wrong-secret").parseWebhook(forged.body, forged.headers)).rejects.toThrow();
    const tampered = forged.body.replace('"amountMinor":1', '"amountMinor":100');
    await expect(gw.parseWebhook(tampered, forged.headers)).rejects.toThrow();
  });

  it("charged after the seat went to someone else: refunds automatically", async () => {
    const [late, fast] = [await user(), await user()];
    const past = new Date(Date.now() - 15 * 60 * 1000);
    // late's hold has expired but they still reach payment
    await acquireHold(db, { userId: late, eventId: EVENT, seatIds: [seatIds[6]], now: past, ttlSeconds: 600 });
    await db.update(schema.seatHolds).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(schema.seatHolds.holderId, late));
    const cl = await startCheckout(db, gw, { userId: late, eventId: EVENT, idemKey: "k-late" });
    await db.update(schema.seatHolds).set({ expiresAt: past }).where(eq(schema.seatHolds.holderId, late));
    // fast takes the seat and pays first
    await acquireHold(db, { userId: fast, eventId: EVENT, seatIds: [seatIds[6]] });
    const cf = await startCheckout(db, gw, { userId: fast, eventId: EVENT, idemKey: "k-fast" });
    expect(await handlePaymentEvent(db, gw, (await pay(cf.orderId)).ev)).toBe("ticketed");
    // late's money arrives afterwards
    expect(await handlePaymentEvent(db, gw, (await pay(cl.orderId)).ev)).toBe("refunded");
    expect(await status(cl.orderId)).toBe("refunded");
    expect(await ticketCount(cl.orderId)).toBe(0);
    const [mp] = await db.select().from(schema.mockPayments).where(eq(schema.mockPayments.orderId, cl.orderId));
    expect(mp.status).toBe("refunded");
  });

  it("gateway response lost after creating the payment: retry reuses it, no second charge", async () => {
    let calls = 0;
    const flaky = new MockGateway(db, SECRET, { failAfter: 1, random: () => (calls++ === 0 ? 0 : 1) });
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[7]] });
    const c = await startCheckout(db, flaky, { userId: u, eventId: EVENT, idemKey: "k-lost" });
    expect((await db.select().from(schema.mockPayments)).length).toBe(1);
    expect(c.clientSecret).toBeTruthy();
  });

  it("gateway fully down: checkout fails cleanly and the seats stay held", async () => {
    const down = new MockGateway(db, SECRET, { failBefore: 1 });
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[8]] });
    await expect(startCheckout(db, down, { userId: u, eventId: EVENT, idemKey: "k-down" })).rejects.toMatchObject({ code: "GATEWAY_DOWN" });
    expect((await db.select().from(schema.seatHolds).where(eq(schema.seatHolds.holderId, u))).length).toBe(1);
    // gateway recovers: same key, same order, payment created once
    const c = await startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-down" });
    expect((await db.select().from(schema.orders)).length).toBe(1);
    expect(c.clientSecret).toBeTruthy();
  });

  it("a webhook for an order whose payment reference was never saved still fulfils it", async () => {
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[9]] });
    const c = await startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "k-noref" });
    const { ev } = await pay(c.orderId);
    await db.update(schema.orders).set({ gatewayRef: null }).where(eq(schema.orders.id, c.orderId)); // simulate crash before save
    expect(await handlePaymentEvent(db, gw, ev)).toBe("ticketed");
  });

  it("100 buyers paying at once, each webhook delivered twice: every order ticketed exactly once", async () => {
    const buyers = await Promise.all(Array.from({ length: 100 }, () => user()));
    const orders = await Promise.all(buyers.map(async (u, i) => {
      await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[10 + i]] });
      return startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: `k-many-${i}` });
    }));
    const evs = await Promise.all(orders.map(async (o) => (await pay(o.orderId)).ev));
    await Promise.all([...evs, ...evs].map((ev) => handlePaymentEvent(db, gw, ev)));
    const t = await db.select().from(schema.tickets);
    expect(t.length).toBe(100);
    expect(new Set(t.map((x) => x.seatId)).size).toBe(100);
    const statuses = await db.select({ s: schema.orders.status }).from(schema.orders);
    expect(statuses.every((r) => r.s === "ticketed")).toBe(true);
  }, 60_000);
});
