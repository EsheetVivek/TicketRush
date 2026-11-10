import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { startCheckout, CheckoutError } from "@/lib/orders";
import { gateway } from "@/lib/payments";
import { clientIp, isSameOrigin, json, rateLimit, Timing } from "@/lib/http";

export const dynamic = "force-dynamic";

const body = z.object({ eventId: z.uuid(), idemKey: z.uuid() }).strict();
const STATUS = { NO_HOLD: 409, FORBIDDEN: 403, GATEWAY_DOWN: 503 } as const;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const t = new Timing();
  const session = await t.db(auth(), "auth");
  if (!session?.user?.id) return json({ error: "Sign in to check out." }, { status: 401 });
  const rl = rateLimit(`checkout:${session.user.id}`, 10, 60_000);
  const rlIp = rateLimit(`checkout-ip:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok || !rlIp.ok) return json({ error: "Too many attempts. Wait a moment and try again." }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid checkout request." }, { status: 400 });

  // Server-Timing: `db` is time spent in the database (session lookup included); `gateway` is the
  // payment provider call, reported separately because it isn't ours to speed up.
  const started = performance.now();
  const dbTime = () => t.add("db", performance.now() - started - t.get("gateway"));
  try {
    const r = await startCheckout(db, gateway(), { userId: session.user.id, ...parsed.data, timing: t });
    dbTime();
    return json(r, { status: 201, headers: t.headers() });
  } catch (e) {
    dbTime();
    if (e instanceof CheckoutError) {
      return json({ error: e.message, code: e.code }, { status: STATUS[e.code], headers: t.headers(e.code === "GATEWAY_DOWN" ? { "Retry-After": "5" } : {}) });
    }
    throw e;
  }
}
