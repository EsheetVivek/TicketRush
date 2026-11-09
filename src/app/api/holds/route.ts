import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { acquireHold, getMyHold, releaseHold, HoldError, MAX_SEATS_PER_HOLD } from "@/lib/holds";
import { clientIp, isSameOrigin, json, rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

const holdBody = z.object({
  eventId: z.uuid(),
  seatIds: z.array(z.uuid()).min(1).max(MAX_SEATS_PER_HOLD),
}).strict(); // unknown fields (e.g. a client-sent price) are rejected, not ignored

const STATUS: Record<HoldError["code"], number> = { INVALID_REQUEST: 400, INVALID_SEATS: 400, NOT_ON_SALE: 409, SOLD: 409, HELD: 409, QUEUE: 403 };

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in to see your held seats." }, { status: 401 });
  const eventId = new URL(req.url).searchParams.get("eventId") ?? "";
  if (!z.uuid().safeParse(eventId).success) return json({ error: "Invalid event." }, { status: 400 });
  return json({ hold: await getMyHold(db, { userId: session.user.id, eventId }) });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in to hold seats." }, { status: 401 });

  const limited = rateLimit(`hold:${session.user.id}`, 10, 60_000);
  const ipLimited = rateLimit(`hold-ip:${clientIp(req)}`, 60, 60_000);
  if (!limited.ok || !ipLimited.ok) {
    return json({ error: "Too many attempts. Wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(Math.max(limited.retryAfterS, ipLimited.retryAfterS)) } });
  }

  const parsed = holdBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: `Invalid request. Choose between 1 and ${MAX_SEATS_PER_HOLD} seats.` }, { status: 400 });

  try {
    const hold = await acquireHold(db, { userId: session.user.id, ...parsed.data });
    return json({ hold }, { status: 201 });
  } catch (e) {
    if (e instanceof HoldError) return json({ error: e.message, code: e.code, seatIds: e.seatIds }, { status: STATUS[e.code] });
    throw e;
  }
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in first." }, { status: 401 });
  const eventId = new URL(req.url).searchParams.get("eventId") ?? "";
  if (!z.uuid().safeParse(eventId).success) return json({ error: "Invalid event." }, { status: 400 });
  return json({ released: await releaseHold(db, { userId: session.user.id, eventId }) });
}
