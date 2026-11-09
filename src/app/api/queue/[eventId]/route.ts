import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { joinQueue, queueStatus } from "@/lib/queue";
import { clientIp, isSameOrigin, json, rateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

async function ctx(params: Promise<{ eventId: string }>) {
  const session = await auth();
  const { eventId } = await params;
  return { userId: session?.user?.id, eventId, valid: z.uuid().safeParse(eventId).success };
}

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const c = await ctx(params);
  if (!c.valid) return json({ error: "Invalid event." }, { status: 400 });
  if (!c.userId) return json({ error: "Sign in to join the line." }, { status: 401 });
  return json(await queueStatus(db, { eventId: c.eventId, userId: c.userId }));
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const c = await ctx(params);
  if (!c.valid) return json({ error: "Invalid event." }, { status: 400 });
  if (!c.userId) return json({ error: "Sign in to join the line." }, { status: 401 });
  if (!rateLimit(`queue-ip:${clientIp(req)}`, 30, 60_000).ok) return json({ error: "Too many attempts." }, { status: 429 });
  return json(await joinQueue(db, { eventId: c.eventId, userId: c.userId }));
}
