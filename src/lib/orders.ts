import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { auditLog, events, orderItems, orders, paymentEvents, refunds, seatHolds, seats, tickets } from "@/db/schema";
import { signTicket } from "@/lib/crypto";
import { withRetries, type PaymentEvent, type PaymentGateway } from "@/lib/payments/gateway";
import { paymentsBreaker, type CircuitBreaker } from "@/lib/payments/breaker";
import type { Timing } from "@/lib/http";
import { uuidArray } from "@/lib/holds";

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
  input: { userId: string; eventId: string; idemKey: string; now?: Date; breaker?: CircuitBreaker; timing?: Timing },
): Promise<{ orderId: string; clientSecret: string | null; amountMinor: number; gateway: PaymentGateway["name"] }> {
  const now = input.now ?? new Date();

  // One statement: reuse the order for this idempotency key if it exists; otherwise lock the
  // buyer's live hold, price it from the seats table, and insert the order, its items and the
  // audit entry. The event title comes back in the same round trip.
  type Row = { id: string; user_id: string; event_id: string; amount_cents: number; gateway_ref: string | null; hold_expires_at: Date | string; title: string | null };
  const created = await db.execute<Row>(sql`
    with existing as (
      select id, user_id, event_id, amount_cents, gateway_ref, hold_expires_at from ${orders} where idem_key = ${input.idemKey}
    ), held as (
      select h.seat_id, h.expires_at from ${seatHolds} h
      where h.holder_id = ${input.userId} and h.event_id = ${input.eventId}
        and h.expires_at > ${now.toISOString()}::timestamp and not exists (select 1 from existing)
      for update of h
    ), priced as (
      select held.seat_id, held.expires_at, s.price_cents from held join ${seats} s on s.id = held.seat_id
    ), ins as (
      insert into ${orders} (user_id, event_id, amount_cents, idem_key, hold_expires_at)
      select ${input.userId}, ${input.eventId}, sum(price_cents)::int, ${input.idemKey}, min(expires_at) from priced having count(*) > 0
      on conflict (idem_key) do nothing
      returning id, user_id, event_id, amount_cents, gateway_ref, hold_expires_at
    ), items as (
      insert into ${orderItems} (order_id, seat_id) select ins.id, priced.seat_id from ins, priced
    ), audit as (
      insert into ${auditLog} (actor_id, action, target, meta)
      select ${input.userId}, 'order.created', 'order:' || ins.id,
        jsonb_build_object('amount', ins.amount_cents, 'seats', (select count(*) from priced)) from ins
    )
    select o.*, ev.title from (select * from ins union all select * from existing) o
    left join ${events} ev on ev.id = o.event_id`);

  let r: Row | undefined = created[0];
  if (!r) {
    // Either there is no live hold, or a concurrent request with the same key won the insert.
    const [o] = await db.select().from(orders).where(eq(orders.idemKey, input.idemKey));
    if (!o) throw new CheckoutError("NO_HOLD", "Your seat hold has expired. Pick your seats again.");
    r = { id: o.id, user_id: o.userId, event_id: o.eventId, amount_cents: o.amountCents, gateway_ref: o.gatewayRef, hold_expires_at: o.holdExpiresAt, title: null };
  }
  if (r.user_id !== input.userId) throw new CheckoutError("FORBIDDEN", "This checkout belongs to someone else.");
  const order = {
    id: r.id, userId: r.user_id, eventId: r.event_id, amountCents: Number(r.amount_cents), gatewayRef: r.gateway_ref,
    holdExpiresAt: r.hold_expires_at instanceof Date ? r.hold_expires_at : new Date(`${String(r.hold_expires_at).replace(" ", "T")}Z`),
  };

  let payment;
  const gwStart = performance.now();
  try {
    payment = await (input.breaker ?? paymentsBreaker).run(() => withRetries(() => gw.createPayment({
      orderId: order.id, amountMinor: order.amountCents, currency: "inr", idempotencyKey: `pi:${order.id}`,
      description: `TicketRush · ${r.title ?? "tickets"}`,
    })));
  } catch {
    input.timing?.add("gateway", performance.now() - gwStart);
    // The hold and order remain, and the hold is extended so an outage doesn't cost the buyer
    // their seats (capped at 30 min after the original expiry). Retrying returns the same payment.
    const extendTo = new Date(Math.min(now.getTime() + 5 * 60_000, order.holdExpiresAt.getTime() + 30 * 60_000));
    await db.update(seatHolds).set({ expiresAt: extendTo })
      .where(and(eq(seatHolds.holderId, order.userId), eq(seatHolds.eventId, order.eventId), sql`${seatHolds.expiresAt} < ${extendTo.toISOString()}::timestamp`));
    throw new CheckoutError("GATEWAY_DOWN", "Payments are briefly unavailable. Your seats are still held, so try again in a moment.");
  }
  input.timing?.add("gateway", performance.now() - gwStart);
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
    // (covers the case where we crashed before saving the reference). The row lock serialises
    // duplicate webhooks; the seat list comes back in the same round trip.
    const lockOrder = (where: ReturnType<typeof sql>) => tx.execute<{ id: string; user_id: string; event_id: string; status: string; amount_cents: number; gateway_ref: string | null; seat_ids: string[] }>(sql`
      select o.id, o.user_id, o.event_id, o.status, o.amount_cents, o.gateway_ref,
        array(select oi.seat_id::text from ${orderItems} oi where oi.order_id = o.id order by oi.seat_id) as seat_ids
      from ${orders} o where ${where} for update of o`);
    let [order] = await lockOrder(sql`o.gateway_ref = ${p.gatewayRef}`);
    if (!order && p.orderId) {
      [order] = await lockOrder(sql`o.id = ${p.orderId}`);
      if (order && !order.gateway_ref) await tx.update(orders).set({ gatewayRef: p.gatewayRef }).where(eq(orders.id, order.id));
    }
    if (!order) return { result: "unknown_order" as const };
    if (order.status === "ticketed" || order.status === "refunded" || order.status === "refund_pending") {
      return { result: "already_done" as const };
    }

    const reason = p.amountMinor !== order.amount_cents ? "amount_mismatch" : null;
    if (!reason) {
      // One statement issues every ticket, marks the order ticketed, releases the hold and writes
      // the audit entry, but only if every seat could be ticketed. UNIQUE(event_id, seat_id) is
      // the final word: a seat already ticketed to someone else makes the count fall short.
      const rows = order.seat_ids.map((seatId) => {
        const id = crypto.randomUUID();
        return sql`(${id}::uuid, ${order.id}::uuid, ${order.event_id}::uuid, ${seatId}::uuid, ${signTicket(id)})`;
      });
      const [r] = await tx.execute<{ ids: string[]; done: boolean }>(sql`
        with t as (
          insert into ${tickets} (id, order_id, event_id, seat_id, qr_sig) values ${sql.join(rows, sql`, `)}
          on conflict (event_id, seat_id) do nothing returning id
        ), upd as (
          update ${orders} set status = 'ticketed', updated_at = ${new Date().toISOString()}::timestamp
          where id = ${order.id} and (select count(*) from t) = ${rows.length} returning id
        ), released as (
          delete from ${seatHolds} where holder_id = ${order.user_id} and seat_id = any(${uuidArray(order.seat_ids)})
            and exists (select 1 from upd)
        ), audit as (
          insert into ${auditLog} (actor_id, action, target) select ${order.user_id}, 'order.ticketed', 'order:' || upd.id from upd
        )
        select array(select id::text from t) as ids, exists (select 1 from upd) as done`);
      if (r.done) return { result: "ticketed" as const };
      // Some seat was taken: remove the tickets this attempt did insert, then refund below.
      if (r.ids.length) await tx.delete(tickets).where(inArray(tickets.id, r.ids));
    }

    await tx.update(orders).set({ status: "refund_pending", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await tx.insert(refunds).values({ orderId: order.id, reason: reason ?? "seat_unavailable" }).onConflictDoNothing();
    await tx.insert(auditLog).values({ actorId: order.user_id, action: "order.refund_pending", target: `order:${order.id}`, meta: { reason: reason ?? "seat_unavailable" } });
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
