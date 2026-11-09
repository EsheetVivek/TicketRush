import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Order status for its owner only. Someone else's order ID returns 404, not 403, so IDs can't be probed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return json({ error: "Not found." }, { status: 404 });
  const [o] = await db.select({ status: orders.status }).from(orders).where(and(eq(orders.id, id), eq(orders.userId, session.user.id)));
  if (!o) return json({ error: "Not found." }, { status: 404 });
  return json(o);
}
