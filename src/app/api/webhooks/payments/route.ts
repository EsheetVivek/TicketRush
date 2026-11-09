import { db } from "@/db";
import { handlePaymentEvent } from "@/lib/orders";
import { gateway } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Gateway → us. Authenticated by signature, not cookies, so it is exempt from the origin check.
 * Returns 2xx only once the event is durably handled; any error makes the gateway retry.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let ev;
  try {
    ev = await gateway().parseWebhook(raw, req.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  const result = await handlePaymentEvent(db, gateway(), ev);
  return Response.json({ received: true, result });
}
