import Stripe from "stripe";
import { GatewayUnavailableError, type PaymentGateway, type PaymentEvent, type PaymentStatus } from "./gateway";

const STATUS: Record<string, PaymentStatus> = {
  requires_payment_method: "requires_payment",
  requires_confirmation: "requires_payment",
  requires_action: "requires_payment",
  processing: "processing",
  succeeded: "succeeded",
  canceled: "canceled",
};

function wrap(e: unknown): never {
  // Network errors, timeouts and 5xx are retryable; card/validation errors are not.
  if (e instanceof Stripe.errors.StripeConnectionError || e instanceof Stripe.errors.StripeAPIError) throw new GatewayUnavailableError();
  throw e;
}

/** Stripe test-mode gateway. Card data is collected by Stripe Elements and never reaches our servers. */
export class StripeGateway implements PaymentGateway {
  readonly name = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string, private webhookSecret: string) {
    if (!secretKey.startsWith("sk_test_")) throw new Error("TicketRush only runs Stripe in test mode (sk_test_ keys).");
    this.stripe = new Stripe(secretKey, { timeout: 8000, maxNetworkRetries: 0 });
  }

  async createPayment(input: Parameters<PaymentGateway["createPayment"]>[0]) {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency,
          description: input.description,
          metadata: { order_id: input.orderId },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { gatewayRef: pi.id, clientSecret: pi.client_secret };
    } catch (e) { wrap(e); }
  }

  async getPayment(ref: string) {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(ref);
      return { status: STATUS[pi.status] ?? "failed", amountMinor: pi.amount_received || pi.amount, orderId: pi.metadata.order_id ?? null };
    } catch (e) { wrap(e); }
  }

  async refund(input: { gatewayRef: string; idempotencyKey: string; reason: string }) {
    try {
      const r = await this.stripe.refunds.create(
        { payment_intent: input.gatewayRef, reason: "requested_by_customer", metadata: { reason: input.reason } },
        { idempotencyKey: input.idempotencyKey },
      );
      return { refundId: r.id, status: r.status === "succeeded" ? ("succeeded" as const) : ("pending" as const) };
    } catch (e) { wrap(e); }
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const sig = headers.get("stripe-signature") ?? "";
    // Throws if the signature is wrong or the timestamp is outside the 5-minute tolerance (replay protection).
    const ev = this.stripe.webhooks.constructEvent(rawBody, sig, this.webhookSecret, 300);
    if (ev.type === "payment_intent.succeeded" || ev.type === "payment_intent.payment_failed") {
      const pi = ev.data.object as Stripe.PaymentIntent;
      return {
        id: ev.id,
        type: ev.type === "payment_intent.succeeded" ? "payment.succeeded" : "payment.failed",
        gatewayRef: pi.id,
        amountMinor: pi.amount_received || pi.amount,
        orderId: pi.metadata.order_id ?? null,
        raw: ev,
      };
    }
    return { id: ev.id, type: "other", gatewayRef: null, amountMinor: null, orderId: null, raw: ev };
  }

  async listSucceededSince(since: Date) {
    const out: { gatewayRef: string; amountMinor: number; orderId: string | null }[] = [];
    try {
      for await (const pi of this.stripe.paymentIntents.list({ created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 })) {
        if (pi.status === "succeeded") out.push({ gatewayRef: pi.id, amountMinor: pi.amount_received, orderId: pi.metadata.order_id ?? null });
      }
    } catch (e) { wrap(e); }
    return out;
  }
}
