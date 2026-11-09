import { and, eq, inArray, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { auditLog, orders, seatHolds } from "@/db/schema";
import { fulfil, issueRefund } from "@/lib/orders";
import type { PaymentGateway } from "@/lib/payments/gateway";

type DB = PostgresJsDatabase<typeof schema>;

export interface ReconcileReport {
  checkedPayments: number;
  fulfilledLate: number;
  refundedLate: number;
  refundsRetried: number;
  refundsCompleted: number;
  expiredOrders: number;
  cleanedHolds: number;
  errors: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Grace period after a hold expires before an unpaid order is given up on. */
const PENDING_GRACE_MS = 30 * 60_000;

/**
 * Second safety net behind webhooks. Runs on a schedule and is safe to run concurrently or twice:
 * every step reuses the same idempotent paths as the webhook handler.
 *
 * 1. Any payment the gateway says succeeded, whose order isn't ticketed or refunded → fulfil
 *    (issue tickets, or refund if the seats are gone).
 * 2. Any order stuck in refund_pending (gateway was down when refunding) → retry the refund.
 * 3. Pending orders well past their hold → ask the gateway; paid → fulfil, otherwise expire.
 * 4. Delete long-expired hold rows.
 */
export async function reconcile(db: DB, gw: PaymentGateway, now = new Date()): Promise<ReconcileReport> {
  const r: ReconcileReport = { checkedPayments: 0, fulfilledLate: 0, refundedLate: 0, refundsRetried: 0, refundsCompleted: 0, expiredOrders: 0, cleanedHolds: 0, errors: [] };

  // 1. Missed webhooks
  try {
    const paid = await gw.listSucceededSince(new Date(now.getTime() - 48 * 3600_000));
    r.checkedPayments = paid.length;
    if (paid.length) {
      const refs = paid.map((p) => p.gatewayRef);
      const done = await db.select({ ref: orders.gatewayRef, id: orders.id, status: orders.status }).from(orders)
        .where(or(inArray(orders.gatewayRef, refs), inArray(orders.id, paid.map((p) => p.orderId).filter((id): id is string => !!id && UUID.test(id)))));
      const settled = new Set(done.filter((o) => ["ticketed", "refunded", "refund_pending"].includes(o.status)).flatMap((o) => [o.ref, o.id]));
      for (const p of paid) {
        if (settled.has(p.gatewayRef) || (p.orderId && settled.has(p.orderId))) continue;
        const res = await fulfil(db, gw, p);
        if (res === "ticketed") r.fulfilledLate++;
        if (res === "refunded" || res === "refund_pending") r.refundedLate++;
      }
    }
  } catch (e) {
    r.errors.push(`payments: ${(e as Error).message}`);
  }

  // 2. Stuck refunds
  const stuck = await db.select({ id: orders.id }).from(orders).where(eq(orders.status, "refund_pending"));
  for (const o of stuck) {
    r.refundsRetried++;
    if (await issueRefund(db, gw, o.id)) r.refundsCompleted++;
  }

  // 3. Abandoned checkouts
  const stale = await db.select().from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.holdExpiresAt, new Date(now.getTime() - PENDING_GRACE_MS))));
  for (const o of stale) {
    try {
      if (o.gatewayRef) {
        const p = await gw.getPayment(o.gatewayRef);
        if (p.status === "succeeded") {
          await fulfil(db, gw, { gatewayRef: o.gatewayRef, orderId: o.id, amountMinor: p.amountMinor });
          r.fulfilledLate++;
          continue;
        }
        if (p.status === "processing") continue; // still settling; look again next run
      }
      const updated = await db.update(orders).set({ status: "expired", updatedAt: now })
        .where(and(eq(orders.id, o.id), eq(orders.status, "pending"))).returning({ id: orders.id });
      if (updated.length) {
        r.expiredOrders++;
        await db.insert(auditLog).values({ actorId: o.userId, action: "order.expired", target: `order:${o.id}` });
      }
    } catch (e) {
      r.errors.push(`order ${o.id}: ${(e as Error).message}`);
    }
  }

  // 4. Housekeeping
  const cleaned = await db.delete(seatHolds).where(lt(seatHolds.expiresAt, new Date(now.getTime() - 24 * 3600_000))).returning({ s: seatHolds.seatId });
  r.cleanedHolds = cleaned.length;
  return r;
}
