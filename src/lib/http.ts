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

/**
 * Server-Timing for API routes: lets the browser's devtools (and the benchmark script) see how
 * long a request spent in the database versus everything else.
 *   const t = new Timing(); const s = await t.db(auth()); ... return json(body, { headers: t.headers() })
 */
export class Timing {
  private readonly start = performance.now();
  private readonly parts = new Map<string, number>();

  add(name: string, ms: number) {
    this.parts.set(name, (this.parts.get(name) ?? 0) + ms);
  }

  /** Time a database-bound promise; adds to `db` and, if given, to its own metric too. */
  async db<T>(p: Promise<T>, name?: string): Promise<T> {
    const t = performance.now();
    try {
      return await p;
    } finally {
      const ms = performance.now() - t;
      this.add("db", ms);
      if (name) this.add(name, ms);
    }
  }

  get(name: string): number {
    return this.parts.get(name) ?? 0;
  }

  header(): string {
    const total = performance.now() - this.start;
    const fmt = (ms: number) => ms.toFixed(1);
    return [...this.parts.entries()].map(([k, v]) => `${k};dur=${fmt(v)}`).concat(`total;dur=${fmt(total)}`).join(", ");
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, "Server-Timing": this.header() };
  }
}
