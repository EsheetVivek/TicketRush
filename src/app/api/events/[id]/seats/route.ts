import { z } from "zod";
import { db } from "@/db";
import { getSeatMap } from "@/lib/holds";
import { Timing } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Public availability. Cached at the edge for 2 s (and served stale for 5 s while refreshing),
 * so thousands of people watching one seat map cost the database one query every 2 s.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Invalid event." }, { status: 400 });
  const t = new Timing();
  const seats = await t.db(getSeatMap(db, id));
  if (!seats.length) return Response.json({ error: "Event not found." }, { status: 404, headers: t.headers() });
  return Response.json({ seats, at: new Date().toISOString() }, {
    headers: t.headers({ "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" }),
  });
}
