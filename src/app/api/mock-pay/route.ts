import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { handlePaymentEvent } from "@/lib/orders";
import { gateway } from "@/lib/payments";
import { MockGateway } from "@/lib/payments/mock";
import { isSameOrigin, json, Timing } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Demo only: completes a payment on the mock gateway and delivers its signed webhook through the
 * same handler real webhooks use. Returns 404 whenever a real gateway (Stripe) is configured.
 */
export async function POST(req: Request) {
  const gw = gateway();
  if (!(gw instanceof MockGateway)) return json({ error: "Not found." }, { status: 404 });
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const t = new Timing();
  const session = await t.db(auth(), "auth");
  if (!session?.user?.id) return json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({ orderId: z.uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, { status: 400 });

  const [order] = await t.db(db.select({ gatewayRef: orders.gatewayRef }).from(orders)
    .where(and(eq(orders.id, parsed.data.orderId), eq(orders.userId, session.user.id))));
  if (!order?.gatewayRef) return json({ error: "Order not found." }, { status: 404, headers: t.headers() });

  // The mock gateway lives in our database, so its time counts as db time here.
  const hook = await t.db(gw.completePayment(order.gatewayRef), "gateway");
  const result = await t.db(handlePaymentEvent(db, gw, await gw.parseWebhook(hook.body, hook.headers)), "fulfil");
  return json({ result }, { headers: t.headers() });
}
