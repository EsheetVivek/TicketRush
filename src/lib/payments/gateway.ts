/**
 * Payment gateway adapter. The app only talks to this interface, so Stripe, Razorpay or the
 * mock used for tests and load tests are interchangeable.
 *
 * Rules every implementation must follow:
 * - createPayment and refund take an idempotency key; repeating a call with the same key must
 *   return the same result and never move money twice.
 * - Amounts are in minor units and always come from our database, never from the browser.
 */
export type PaymentStatus = "requires_payment" | "processing" | "succeeded" | "failed" | "canceled";

export interface CreatePaymentInput {
  orderId: string;
  amountMinor: number;
  currency: "inr";
  idempotencyKey: string;
  description: string;
}

export interface CreatedPayment {
  gatewayRef: string;
  clientSecret: string | null; // used by the browser SDK to collect card details
}

export interface PaymentEvent {
  id: string; // gateway's event ID, used for dedupe
  type: "payment.succeeded" | "payment.failed" | "refund.succeeded" | "other";
  gatewayRef: string | null;
  amountMinor: number | null;
  orderId: string | null;
  raw: unknown;
}

export interface PaymentGateway {
  readonly name: "stripe" | "razorpay" | "mock";
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  getPayment(gatewayRef: string): Promise<{ status: PaymentStatus; amountMinor: number; orderId: string | null }>;
  refund(input: { gatewayRef: string; idempotencyKey: string; reason: string }): Promise<{ refundId: string; status: "pending" | "succeeded" }>;
  /** Verify the signature and parse a webhook. Throws on an invalid or forged signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
  /** Payments that succeeded since a point in time, for the reconciler. */
  listSucceededSince(since: Date): Promise<{ gatewayRef: string; amountMinor: number; orderId: string | null }[]>;
}

export class GatewayUnavailableError extends Error {
  constructor(message = "Payment provider is not responding.") {
    super(message);
  }
}

/** Retry a gateway call with the same idempotency key: safe because the gateway dedupes on it. */
export async function withRetries<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 200): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw last instanceof GatewayUnavailableError ? last : new GatewayUnavailableError();
}
