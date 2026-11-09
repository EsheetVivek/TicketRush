import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { mockPayments } from "@/db/schema";
import { GatewayUnavailableError, type PaymentEvent, type PaymentGateway } from "./gateway";

type DB = PostgresJsDatabase<typeof schema>;

export interface FaultPlan {
  /** Probability (0–1) that a call fails as if the gateway timed out *before* doing anything. */
  failBefore?: number;
  /** Probability that the call succeeds at the gateway but the response is lost (timeout after). */
  failAfter?: number;
  /** Extra latency per call in ms. */
  latencyMs?: number;
  random?: () => number;
}

/**
 * A gateway that behaves like Stripe where it matters (idempotency keys, signed webhooks,
 * retrievable state), with optional fault injection for crash and timeout testing.
 */
export class MockGateway implements PaymentGateway {
  readonly name = "mock" as const;
  constructor(private db: DB, private webhookSecret: string, private faults: FaultPlan = {}) {}

  private async chaos<T>(fn: () => Promise<T>): Promise<T> {
    const rnd = this.faults.random ?? Math.random;
    if (this.faults.latencyMs) await new Promise((r) => setTimeout(r, this.faults.latencyMs));
    if (rnd() < (this.faults.failBefore ?? 0)) throw new GatewayUnavailableError("mock: timeout before processing");
    const out = await fn();
    if (rnd() < (this.faults.failAfter ?? 0)) throw new GatewayUnavailableError("mock: response lost after processing");
    return out;
  }

  createPayment(input: Parameters<PaymentGateway["createPayment"]>[0]) {
    return this.chaos(async () => {
      const ref = `mock_pi_${input.orderId}`;
      await this.db.insert(mockPayments)
        .values({ ref, idemKey: input.idempotencyKey, orderId: input.orderId, amountMinor: input.amountMinor })
        .onConflictDoNothing();
      const [row] = await this.db.select().from(mockPayments).where(eq(mockPayments.idemKey, input.idempotencyKey));
      return { gatewayRef: row.ref, clientSecret: `${row.ref}_secret` };
    });
  }

  async getPayment(ref: string) {
    const [row] = await this.db.select().from(mockPayments).where(eq(mockPayments.ref, ref));
    if (!row) throw new Error("mock: unknown payment");
    return { status: row.status as "succeeded", amountMinor: row.amountMinor, orderId: row.orderId };
  }

  /** Simulates the buyer completing payment at the gateway. Returns the signed webhook it would send. */
  async completePayment(ref: string): Promise<{ body: string; headers: Headers }> {
    const [row] = await this.db.update(mockPayments).set({ status: "succeeded" }).where(eq(mockPayments.ref, ref)).returning();
    if (!row) throw new Error("mock: unknown payment");
    return this.signedEvent({ id: `mock_evt_${ref}_succeeded`, type: "payment.succeeded", gatewayRef: ref, amountMinor: row.amountMinor, orderId: row.orderId });
  }

  refund(input: { gatewayRef: string; idempotencyKey: string; reason: string }) {
    return this.chaos(async () => {
      // Idempotent: the refund key is unique; a repeat returns the same refund.
      await this.db.update(mockPayments).set({ status: "refunded", refundIdemKey: input.idempotencyKey })
        .where(and(eq(mockPayments.ref, input.gatewayRef), eq(mockPayments.status, "succeeded")));
      const [row] = await this.db.select().from(mockPayments).where(eq(mockPayments.ref, input.gatewayRef));
      if (!row || row.status !== "refunded") throw new Error("mock: payment not refundable");
      return { refundId: `mock_re_${input.gatewayRef}`, status: "succeeded" as const };
    });
  }

  signedEvent(ev: Omit<PaymentEvent, "raw">): { body: string; headers: Headers } {
    const body = JSON.stringify(ev);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", this.webhookSecret).update(`${t}.${body}`).digest("hex");
    return { body, headers: new Headers({ "x-mock-signature": `t=${t},v1=${sig}` }) };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const parts = Object.fromEntries((headers.get("x-mock-signature") ?? "").split(",").map((p) => p.split("=")));
    const t = Number(parts.t);
    if (!t || Math.abs(Date.now() / 1000 - t) > 300) throw new Error("Webhook timestamp outside tolerance");
    const expected = Buffer.from(createHmac("sha256", this.webhookSecret).update(`${t}.${rawBody}`).digest("hex"));
    const given = Buffer.from(String(parts.v1 ?? ""));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new Error("Invalid webhook signature");
    return { ...JSON.parse(rawBody), raw: JSON.parse(rawBody) };
  }

  async listSucceededSince(since: Date) {
    const rows = await this.db.select().from(mockPayments)
      .where(and(eq(mockPayments.status, "succeeded"), gte(mockPayments.createdAt, since)));
    return rows.map((r) => ({ gatewayRef: r.ref, amountMinor: r.amountMinor, orderId: r.orderId }));
  }
}
