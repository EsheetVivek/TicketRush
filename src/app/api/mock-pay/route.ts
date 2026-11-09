import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { handlePaymentEvent } from "@/lib/orders";
import { gateway } from "@/lib/payments";
import { MockGateway } from "@/lib/payments/mock";
import { isSameOrigin, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Demo only: completes a payment on the mock gateway and delivers its signed webhook through the
 * same handler real webhooks use. Returns 404 whenever a real gateway (Stripe) is configured.
 */
export async function POST(req: Request) {
  const gw = gateway();
  if (!(gw instanceof MockGateway)) return json({ error: "Not found." }, { status: 404 });
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({ orderId: z.uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, { status: 400 });

  const [order] = await db.select().from(orders).where(and(eq(orders.id, parsed.data.orderId), eq(orders.userId, session.user.id)));
  if (!order?.gatewayRef) return json({ error: "Order not found." }, { status: 404 });

  const hook = await gw.completePayment(order.gatewayRef);
  const result = await handlePaymentEvent(db, gw, await gw.parseWebhook(hook.body, hook.headers));
  return json({ result });
}
