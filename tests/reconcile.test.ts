import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { acquireHold, getSeatMap } from "@/lib/holds";
import { startCheckout, handlePaymentEvent } from "@/lib/orders";
import { reconcile } from "@/lib/reconcile";
import { MockGateway } from "@/lib/payments/mock";
import { CircuitBreaker } from "@/lib/payments/breaker";
import { SEED_EVENTS } from "@/db/seed-data";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const EVENT = SEED_EVENTS[1].id;

run("reconciler and outage handling", () => {
  const client = postgres(url ?? "", { max: 20, ssl: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const gw = new MockGateway(db, "whsec_test");
  let seatIds: string[] = [];
  let n = 0;
  const user = async () => { const id = `rec-${Date.now()}-${n++}`; await db.insert(schema.users).values({ id, email: `${id}@test.local` }); return id; };
  const order = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
  async function reset() {
    await db.execute(sql`delete from tickets; delete from refunds; delete from order_items; delete from payment_events;`);
    await db.execute(sql`delete from orders; delete from seat_holds; delete from mock_payments; delete from audit_log;`);
  }
  beforeAll(async () => {
    process.env.TICKET_SIGNING_SECRET = "test-ticket-secret";
    seatIds = (await db.select({ id: schema.seats.id }).from(schema.seats).where(eq(schema.seats.eventId, EVENT))).map((s) => s.id);
  });
  beforeEach(reset);
  afterAll(async () => { await reset(); await db.execute(sql`delete from users where email like '%@test.local'`); await client.end(); });

  it("webhook never arrives: the reconciler issues the tickets", async () => {
    const u = await user();
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[0]] });
    const c = await startCheckout(db, gw, { userId: u, eventId: EVENT, idemKey: "r-lost", breaker: new CircuitBreaker() });
    await gw.completePayment((await order(c.orderId)).gatewayRef!); // charged, webhook dropped
    expect((await order(c.orderId)).status).toBe("pending");
    const rep = await reconcile(db, gw);
    expect(rep.fulfilledLate).toBe(1);
    expect((await order(c.orderId)).status).toBe("ticketed");
    expect((await reconcile(db, gw)).fulfilledLate).toBe(0); // second run is a no-op
  });

  it("refund fails while the gateway is down, then completes on the next run", async () => {
    const [late, fast] = [await user(), await user()];
    await acquireHold(db, { userId: late, eventId: EVENT, seatIds: [seatIds[1]] });
    const cl = await startCheckout(db, gw, { userId: late, eventId: EVENT, idemKey: "r-late", breaker: new CircuitBreaker() });
    await db.update(schema.seatHolds).set({ expiresAt: new Date(Date.now() - 1000) });
    await acquireHold(db, { userId: fast, eventId: EVENT, seatIds: [seatIds[1]] });
    const cf = await startCheckout(db, gw, { userId: fast, eventId: EVENT, idemKey: "r-fast", breaker: new CircuitBreaker() });
    const hf = await gw.completePayment((await order(cf.orderId)).gatewayRef!);
    await handlePaymentEvent(db, gw, await gw.parseWebhook(hf.body, hf.headers));

    const down = new MockGateway(db, "whsec_test", { failBefore: 1 });
    const hl = await gw.completePayment((await order(cl.orderId)).gatewayRef!);
    expect(await handlePaymentEvent(db, down, await gw.parseWebhook(hl.body, hl.headers))).toBe("refund_pending");
    expect((await order(cl.orderId)).status).toBe("refund_pending");

    const rep = await reconcile(db, gw);
    expect(rep.refundsCompleted).toBe(1);
    expect((await order(cl.orderId)).status).toBe("refunded");
  }, 30_000);

  it("abandoned checkout: expires the order and frees the seats; a late payment is still honoured", async () => {
    const [quitter, slowPayer] = [await user(), await user()];
    await acquireHold(db, { userId: quitter, eventId: EVENT, seatIds: [seatIds[2]] });
    const cq = await startCheckout(db, gw, { userId: quitter, eventId: EVENT, idemKey: "r-quit", breaker: new CircuitBreaker() });
    await acquireHold(db, { userId: slowPayer, eventId: EVENT, seatIds: [seatIds[3]] });
    const cs = await startCheckout(db, gw, { userId: slowPayer, eventId: EVENT, idemKey: "r-slow", breaker: new CircuitBreaker() });
    await gw.completePayment((await order(cs.orderId)).gatewayRef!); // paid, but no webhook
    const later = new Date(Date.now() + 60 * 60_000);
    // Make both look stale, and hide the slow payer's payment from the "recent payments" sweep.
    const rep = await reconcile(db, { ...gw, name: "mock", listSucceededSince: async () => [], getPayment: (r: string) => gw.getPayment(r), refund: gw.refund.bind(gw), createPayment: gw.createPayment.bind(gw), parseWebhook: gw.parseWebhook.bind(gw) }, later);
    expect(rep.expiredOrders).toBe(1);
    expect((await order(cq.orderId)).status).toBe("expired");
    expect((await order(cs.orderId)).status).toBe("ticketed");
    const map = await getSeatMap(db, EVENT, later);
    expect(map.find((s) => s.id === seatIds[2])?.status).toBe("available");
  });

  it("gateway outage at checkout extends the buyer's hold", async () => {
    const u = await user();
    const soon = new Date(Date.now() - 9 * 60_000); // hold placed 9 min ago, 1 min left
    await acquireHold(db, { userId: u, eventId: EVENT, seatIds: [seatIds[4]], now: soon });
    const down = new MockGateway(db, "whsec_test", { failBefore: 1 });
    await expect(startCheckout(db, down, { userId: u, eventId: EVENT, idemKey: "r-ext", breaker: new CircuitBreaker() })).rejects.toMatchObject({ code: "GATEWAY_DOWN" });
    const [h] = await db.select().from(schema.seatHolds).where(eq(schema.seatHolds.holderId, u));
    expect(h.expiresAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
  }, 30_000);
});
