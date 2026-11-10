import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database reachability, used by uptime checks and the portfolio's health check.
 * latencyMs is one round trip from this function to the database (the first query also warms the
 * connection, so it is measured on a second query). Above ~20 ms usually means the function and
 * the database are in different regions. `region` is the Vercel region serving the request.
 */
/** Cloud region of the database host (e.g. "us-east-1" from a Neon hostname). No credentials leave. */
function dbRegion(): string | null {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    return host.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\./)?.[1] ?? host.match(/\.([a-z]+-[a-z]+\d?)\.azure\./)?.[1] ?? null;
  } catch { return null; }
}

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const started = performance.now();
    await db.execute(sql`select 1`);
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    return Response.json(
      { status: "ok", db: "ok", latencyMs, region: process.env.VERCEL_REGION ?? "local", dbRegion: dbRegion() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
