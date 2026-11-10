/**
 * Tiny per-process cache with request coalescing: while a value is fresh it's served from memory,
 * and when it expires only one caller recomputes it while concurrent callers await the same
 * promise. Used for the public seat map, which is already edge-cached for 2 s on Vercel; this keeps
 * the same behaviour when there's no CDN in front (self-hosting, the load test) and protects the
 * database from a stampede at the moment a drop opens.
 */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: now, value });
  value.catch(() => store.delete(key)); // never cache failures
  if (store.size > 1000) store.clear();
  return value;
}
