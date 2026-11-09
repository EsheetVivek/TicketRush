import { db } from "@/db";
import type { PaymentGateway } from "./gateway";
import { MockGateway } from "./mock";
import { StripeGateway } from "./stripe";

let cached: PaymentGateway | null = null;

/** Stripe when test keys are configured; otherwise the mock gateway (demo and tests). */
export function gateway(): PaymentGateway {
  if (cached) return cached;
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, MOCK_WEBHOOK_SECRET, AUTH_SECRET } = process.env;
  cached = STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET
    ? new StripeGateway(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
    : new MockGateway(db, MOCK_WEBHOOK_SECRET ?? `mock:${AUTH_SECRET ?? "dev"}`);
  return cached;
}
