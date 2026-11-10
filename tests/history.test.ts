import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { acquireHold } from "@/lib/holds";
import { startCheckout, handlePaymentEvent } from "@/lib/orders";
import { MockGateway } from "@/lib/payments/mock";
import { formatSeats, getOrderHistory, shortRef, HISTORY_PAGE_SIZE } from "@/lib/history";
import { SEED_EVENTS } from "@/db/seed-data";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const EVENT = SEED_EVENTS[1].id; // Indie Night, no waiting room

run("transaction history", () => {
  const client = postgres(url ?? "", { max: 10, ssl: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const gw = new MockGateway(db, "whsec_hist");
  let seatIds: string[] = [];
  let n = 0;
  const user = async () => {
    const id = `hist-${Date.now()}-${n++}`;
    await db.insert(schema.users).values({ id, email: `${id}@test.local` });
    return id;
  };
  async function buy(userId: string, seats: string[], key: string) {
    await acquireHold(db, { userId, eventId: EVENT, seatIds: seats });
    const c = await startCheckout(db, gw, { userId, eventId: EVENT, idemKey: key });
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, c.orderId));
    const hook = await gw.completePayment(o.gatewayRef!);
    await handlePaymentEvent(db, gw, await gw.parseWebhook(hook.body, hook.headers));
    return c.orderId;
  }
  async function reset() {
    await db.execute(sql`delete from tickets; delete from refunds; delete from order_items; delete from payment_events;`);
    await db.execute(sql`delete from orders; delete from seat_holds; delete from mock_payments; delete from audit_log;`);
  }
  beforeAll(async () => {
    process.env.TICKET_SIGNING_SECRET = "test-ticket-secret";
    seatIds = (await db.select({ id: schema.seats.id }).from(schema.seats).where(eq(schema.seats.eventId, EVENT))
      .orderBy(schema.seats.row, schema.seats.number)).map((s) => s.id);
  });
  beforeEach(reset);
  afterAll(async () => { await reset(); await db.execute(sql`delete from users where email like 'hist-%@test.local'`); await client.end(); });

  it("shows a buyer only their own orders, newest first, with seats and totals", async () => {
    const [alice, bob] = [await user(), await user()];
    const a1 = await buy(alice, [seatIds[0], seatIds[1]], "h-a1");
    const a2 = await buy(alice, [seatIds[2]], "h-a2");
    const b1 = await buy(bob, [seatIds[3]], "h-b1");

    const mine = await getOrderHistory(db, alice);
    expect(mine.rows.map((r) => r.id)).toEqual([a2, a1]);
    expect(mine.rows.map((r) => r.id)).not.toContain(b1);
    expect(mine.stats).toMatchObject({ orders: 2, ticketsHeld: 3, spentCents: 179900 * 3, refunds: 0 });
    expect(mine.rows[1].status).toBe("Ticketed");
    expect(formatSeats(mine.rows[1].seats)).toBe("Front · A1, A2");

    const theirs = await getOrderHistory(db, bob);
    expect(theirs.rows.map((r) => r.id)).toEqual([b1]);
    expect(theirs.stats.ticketsHeld).toBe(1);

    const stranger = await getOrderHistory(db, await user());
    expect(stranger.rows).toEqual([]);
    expect(stranger.stats.orders).toBe(0);
  });

  it("paginates 20 per page and labels refunded and pending orders", async () => {
    const u = await user();
    const rows = Array.from({ length: HISTORY_PAGE_SIZE + 3 }, (_, i) => ({
      userId: u, eventId: EVENT, amountCents: 1000, idemKey: `h-page-${i}`, holdExpiresAt: new Date(),
      status: (i === 0 ? "refunded" : i === 1 ? "refund_pending" : "pending") as "pending",
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
    }));
    await db.insert(schema.orders).values(rows);
    const p1 = await getOrderHistory(db, u, 1);
    const p2 = await getOrderHistory(db, u, 2);
    expect(p1.rows).toHaveLength(20);
    expect(p2.rows).toHaveLength(3);
    expect(p1.pages).toBe(2);
    expect(p2.rows.at(-1)!.status).toBe("Refunded");
    expect(p2.rows.at(-2)!.status).toBe("Refund pending");
    expect(p1.rows[0].status).toBe("Pending");
    expect(p1.stats).toMatchObject({ refunds: 2, refundedCents: 1000, spentCents: 0 });
    expect((await getOrderHistory(db, u, -5)).page).toBe(1);
  });

  it("shortens long payment references", () => {
    expect(shortRef("mock_pi_6f1c1d0e-5a3b-4c55-9a0e-6b2d1e00a9c2")).toBe("mock_pi_6f…a9c2");
    expect(shortRef("pi_short")).toBe("pi_short");
  });
});
