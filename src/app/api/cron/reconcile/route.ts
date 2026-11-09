import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { reconcile } from "@/lib/reconcile";
import { gateway } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called every 5 minutes by GitHub Actions (free) and daily by Vercel Cron as a backup. */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const report = await reconcile(db, gateway());
  return Response.json(report, { status: report.errors.length ? 500 : 200 });
}
