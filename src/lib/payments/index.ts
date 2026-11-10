import { db } from "@/db";
import type { PaymentGateway } from "./gateway";
import { MockGateway, type FaultPlan } from "./mock";
import { StripeGateway } from "./stripe";

let cached: PaymentGateway | null = null;

/** Stripe when test keys are configured; otherwise the mock gateway (demo and tests). */
export function gateway(): PaymentGateway {
  if (cached) return cached;
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, MOCK_WEBHOOK_SECRET, AUTH_SECRET } = process.env;
  cached = STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET
    ? new StripeGateway(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
    : new MockGateway(db, MOCK_WEBHOOK_SECRET ?? `mock:${AUTH_SECRET ?? "dev"}`, faultsFromEnv());
  return cached;
}

/**
 * Fault injection for load and chaos tests, e.g. MOCK_FAULTS="failBefore=0.05,failAfter=0.05,latencyMs=150".
 * Ignored on Vercel production so a stray variable can never degrade the live demo.
 */
export function faultsFromEnv(raw = process.env.MOCK_FAULTS, env = process.env.VERCEL_ENV): FaultPlan {
  if (!raw || env === "production") return {};
  const plan: FaultPlan = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((x) => x.trim());
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    if (k === "failBefore" || k === "failAfter" || k === "dropWebhook") plan[k] = Math.min(n, 1);
    if (k === "latencyMs") plan.latencyMs = Math.min(n, 10_000);
  }
  return plan;
}
