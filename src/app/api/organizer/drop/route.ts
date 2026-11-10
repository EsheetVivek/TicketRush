import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { isOrganizer, startDrop } from "@/lib/organizer";
import { isSameOrigin, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Organizer only. Anyone else gets the same 404 as a missing route. */
export async function POST(req: Request) {
  const session = await auth();
  if (!isOrganizer(session)) return json({ error: "Not found." }, { status: 404 });
  if (!isSameOrigin(req)) return json({ error: "Cross-site request blocked." }, { status: 403 });
  const parsed = z.object({ eventId: z.uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, { status: 400 });
  const r = await startDrop(db, { eventId: parsed.data.eventId, actorId: session!.user!.id! });
  if (!r) return json({ error: "Event not found." }, { status: 404 });
  return json(r);
}
