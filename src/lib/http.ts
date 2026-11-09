/** Small HTTP helpers shared by API routes. */

export function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) } });
}

/**
 * CSRF defence in depth for cookie-authenticated, state-changing requests: the Origin header must
 * match this site. (SameSite=Lax cookies already stop most cross-site POSTs; this also blocks
 * same-site subdomain attacks and old browsers.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * Sliding-window rate limiter. This in-memory version limits per server instance; with Upstash
 * Redis configured it is swapped for a shared limiter so limits hold across all instances.
 */
const windows = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const hits = (windows.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) return { ok: false, retryAfterS: Math.ceil((hits[0] + windowMs - now) / 1000) };
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 50_000) windows.clear(); // bound memory under abuse
  return { ok: true, retryAfterS: 0 };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
