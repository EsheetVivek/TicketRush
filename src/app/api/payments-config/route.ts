import { gateway } from "@/lib/payments";

/** Tells the browser which payment UI to show. Contains no secrets. */
export function GET() {
  return Response.json({ gateway: gateway().name, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null });
}
