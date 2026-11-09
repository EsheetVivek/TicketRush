import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { auditLog, events, orderItems, orders, paymentEvents, refunds, seatHolds, seats, tickets } from "@/db/schema";
import { signTicket } from "@/lib/crypto";
import { withRetries, type PaymentEvent, type PaymentGateway } from "@/lib/payments/gateway";

type DB = PostgresJsDatabase<typeof schema>;

export class CheckoutError extends Error {
  constructor(public code: "NO_HOLD" | "FORBIDDEN" | "GATEWAY_DOWN", message: string) {
    super(message);
  }
}

/**
 * Turn the buyer's current seat hold into an order and a payment.
 *
 * Idempotent end to end: the browser sends one idempotency key per checkout attempt. A double
 * click or a retried request finds the same order, and the gateway call reuses the key
 * `pi:<orderId>`, so the gateway returns the same payment instead of creating a second one.
 * The amount is always computed from the seats table, never taken from the request.
 */
export async function startCheckout(
  db: DB,
  gw: PaymentGateway,
  input: { userId: string; eventId: string; idemKey: string; now?: Date },
): Promise<{ orderId: string; clientSecret: string | null; amountMinor: number; gateway: PaymentGateway["name"] }> {
  const now = input.now ?? new Date();

  let order = (await db.select().from(orders).where(eq(orders.idemKey, input.idemKey)))[0];
  if (order && order.userId !== input.userId) throw new CheckoutError("FORBIDDEN", "This checkout belongs to someone else.");

  if (!order) {
    order = await db.transaction(async (tx) => {
      const held = await tx.select({ seatId: seatHolds.seatId, expiresAt: seatHolds.expiresAt }).from(seatHolds)
        .where(and(eq(seatHolds.holderId, input.userId), eq(seatHolds.eventId, input.eventId), gt(seatHolds.expiresAt, now)))
        .for("update");
      if (!held.length) throw new CheckoutError("NO_HOLD", "Your seat hold has expired. Pick your seats again.");

      const priced = await tx.select({ id: seats.id, price: seats.priceCents }).from(seats)
        .where(inArray(seats.id, held.map((h) => h.seatId)));
      const amount = priced.reduce((sum, s) => sum + s.price, 0);

      const [created] = await tx.insert(orders).values({
        userId: input.userId, eventId: input.eventId, amountCents: amount, idemKey: input.idemKey, holdExpiresAt: held[0].expiresAt,
      }).onConflictDoNothing({ target: orders.idemKey }).returning();
      if (!created) return (await tx.select().from(orders).where(eq(orders.idemKey, input.idemKey)))[0];

      await tx.insert(orderItems).values(held.map((h) => ({ orderId: created.id, seatId: h.seatId })));
      await tx.insert(auditLog).values({ actorId: input.userId, action: "order.created", target: `order:${created.id}`, meta: { amount, seats: held.length } });
      return created;
    });
    if (order.userId !== input.userId) throw new CheckoutError("FORBIDDEN", "This checkout belongs to someone else.");
  }

  const [event] = await db.select({ title: events.title }).from(events).where(eq(events.id, order.eventId));
  let payment;
  try {
    payment = await withRetries(() => gw.createPayment({
      orderId: order.id, amountMinor: order.amountCents, currency: "inr", idempotencyKey: `pi:${order.id}`,
      description: `TicketRush · ${event?.title ?? "tickets"}`,
    }));
  } catch {
    // The hold and order remain; the buyer can retry and will get the same payment.
    throw new CheckoutError("GATEWAY_DOWN", "Payments are briefly unavailable. Your seats are still held, so try again in a moment.");
  }
  if (!order.gatewayRef) {
    await db.update(orders).set({ gatewayRef: payment.gatewayRef, updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), sql`${orders.gatewayRef} is null`));
  }
  return { orderId: order.id, clientSecret: payment.clientSecret, amountMinor: order.amountCents, gateway: gw.name };
}

export type FulfilResult = "ticketed" | "refunded" | "refund_pending" | "already_done" | "duplicate_event" | "ignored" | "unknown_order";

/** Handle a verified webhook event. Safe to receive the same event any number of times, in any order. */
export async function handlePaymentEvent(db: DB, gw: PaymentGateway, ev: PaymentEvent): Promise<FulfilResult> {
  const fresh = await db.insert(paymentEvents)
    .values({ gatewayEventId: ev.id, type: ev.type, payload: ev.raw as object })
    .onConflictDoNothing().returning({ id: paymentEvents.gatewayEventId });
  if (!fresh.length) return "duplicate_event";
  if (ev.type !== "payment.succeeded" || !ev.gatewayRef || ev.amountMinor == null) return "ignored";
  try {
    return await fulfil(db, gw, { gatewayRef: ev.gatewayRef, orderId: ev.orderId, amountMinor: ev.amountMinor });
  } catch (e) {
    // Un-mark the event so the gateway's retry is processed (the reconciler is the second safety net).
    await db.delete(paymentEvents).where(eq(paymentEvents.gatewayEventId, ev.id));
    throw e;
  }
}

/**
 * Issue tickets for a successful payment, or refund it if tickets can't be issued.
 * Also used by the reconciler when a webhook never arrived.
 */
export async function fulfil(
  db: DB,
  gw: PaymentGateway,
  p: { gatewayRef: string; orderId: string | null; amountMinor: number },
): Promise<FulfilResult> {
  const outcome = await db.transaction(async (tx) => {
    // Find the order by payment reference, or by the order ID the gateway echoes back
    // (covers the case where we crashed before saving the reference).
    let [order] = await tx.select().from(orders).where(eq(orders.gatewayRef, p.gatewayRef)).for("update");
    if (!order && p.orderId) {
      [order] = await tx.select().from(orders).where(eq(orders.id, p.orderId)).for("update");
      if (order && !order.gatewayRef) await tx.update(orders).set({ gatewayRef: p.gatewayRef }).where(eq(orders.id, order.id));
    }
    if (!order) return { result: "unknown_order" as const };
    if (order.status === "ticketed" || order.status === "refunded" || order.status === "refund_pending") {
      return { result: "already_done" as const };
    }

    const reason = p.amountMinor !== order.amountCents ? "amount_mismatch" : null;
    let issued = false;
    if (!reason) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      try {
        // Savepoint: if any seat was already ticketed to someone else, undo only the ticket inserts.
        await tx.transaction(async (sp) => {
          const rows = items.map((i) => {
            const id = crypto.randomUUID();
            return { id, orderId: order.id, eventId: order.eventId, seatId: i.seatId, qrSig: signTicket(id) };
          });
          const inserted = await sp.insert(tickets).values(rows).onConflictDoNothing({ target: [tickets.eventId, tickets.seatId] }).returning({ id: tickets.id });
          if (inserted.length !== rows.length) throw new Error("seat_taken");
        });
        issued = true;
      } catch (e) {
        if ((e as Error).message !== "seat_taken") throw e;
      }
      if (issued) {
        await tx.update(orders).set({ status: "ticketed", updatedAt: new Date() }).where(eq(orders.id, order.id));
        await tx.delete(seatHolds).where(and(eq(seatHolds.holderId, order.userId), inArray(seatHolds.seatId, items.map((i) => i.seatId))));
        await tx.insert(auditLog).values({ actorId: order.userId, action: "order.ticketed", target: `order:${order.id}` });
        return { result: "ticketed" as const };
      }
    }

    await tx.update(orders).set({ status: "refund_pending", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(refunds).values({ orderId: order.id, reason: reason ?? "seat_unavailable" }).onConflictDoNothing();
    await tx.insert(auditLog).values({ actorId: order.userId, action: "order.refund_pending", target: `order:${order.id}`, meta: { reason: reason ?? "seat_unavailable" } });
    return { result: "refund_pending" as const, orderId: order.id };
  });

  if (outcome.result !== "refund_pending") return outcome.result;
  return (await issueRefund(db, gw, outcome.orderId)) ? "refunded" : "refund_pending";
}

/** Refund an order in refund_pending. Idempotent via the key `refund:<orderId>`; retried by the reconciler if the gateway is down. */
export async function issueRefund(db: DB, gw: PaymentGateway, orderId: string): Promise<boolean> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== "refund_pending" || !order.gatewayRef) return order?.status === "refunded";
  try {
    const r = await withRetries(() => gw.refund({ gatewayRef: order.gatewayRef!, idempotencyKey: `refund:${order.id}`, reason: "tickets_unavailable" }));
    await db.transaction(async (tx) => {
      await tx.update(refunds).set({ gatewayRefundId: r.refundId, status: r.status }).where(eq(refunds.orderId, order.id));
      await tx.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(eq(orders.id, order.id));
      await tx.insert(auditLog).values({ actorId: order.userId, action: "order.refunded", target: `order:${order.id}`, meta: { refundId: r.refundId } });
    });
    return true;
  } catch {
    return false; // stays refund_pending; the reconciler retries
  }
}
