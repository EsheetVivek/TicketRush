import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { randomBytes, randomUUID } from "node:crypto";
import { SEED_EVENTS } from "@/db/seed-data";

/**
 * Attacks against the running app (production build), the way an outsider would try them:
 * forged sessions, cross-site requests, tampered bodies, other people's orders, forged webhooks,
 * unauthenticated cron calls and request floods. Each must fail safely.
 *
 * Needs E2E_URL (e.g. http://localhost:3000) and DATABASE_URL (to create test users and sessions
 * directly, which is how a signed-in browser looks to the server).
 */
const BASE = process.env.E2E_URL ?? "";
const DB = process.env.DATABASE_URL ?? "";
const run = BASE && DB ? describe : describe.skip;

const INDIE = SEED_EVENTS[1].id; // no waiting room
const CONCERT = SEED_EVENTS[0].id; // waiting room on

run("security: attacks fail safely", () => {
  const sql = postgres(DB, { max: 2, ssl: false, onnotice: () => {} });
  const tag = randomBytes(4).toString("hex");
  const users: Record<"a" | "b", { id: string; cookie: string }> = { a: { id: "", cookie: "" }, b: { id: "", cookie: "" } };
  let indieSeats: string[] = [];
  let concertSeat = "";
  let orderOfA = "";

  async function makeUser(name: string) {
    const id = `e2e-${tag}-${name}`;
    const token = randomBytes(32).toString("hex");
    await sql`insert into users (id, email, name) values (${id}, ${`${id}@e2e.local`}, ${name})`;
    await sql`insert into sessions (session_token, user_id, expires) values (${token}, ${id}, ${new Date(Date.now() + 3600_000)})`;
    return { id, cookie: `authjs.session-token=${token}` };
  }

  const api = (path: string, init: RequestInit & { as?: "a" | "b"; origin?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    if (init.as) headers.set("cookie", users[init.as].cookie);
    if (init.origin !== null) headers.set("origin", init.origin ?? BASE);
    if (init.body) headers.set("content-type", "application/json");
    return fetch(BASE + path, { ...init, headers, redirect: "manual" });
  };

  beforeAll(async () => {
    users.a = await makeUser("a");
    users.b = await makeUser("b");
    indieSeats = (await sql`select s.id from seats s where s.event_id = ${INDIE}
      and not exists (select 1 from seat_holds h where h.seat_id = s.id)
      and not exists (select 1 from tickets t where t.seat_id = s.id) limit 6`).map((r) => r.id as string);
    concertSeat = (await sql`select id from seats where event_id = ${CONCERT} limit 1`)[0].id as string;
    expect(indieSeats.length).toBeGreaterThanOrEqual(4);
  });

  afterAll(async () => {
    await sql`delete from users where id like ${`e2e-${tag}-%`}`;
    await sql.end();
  });

  it("sends security headers (CSP, HSTS, nosniff, no framing)", async () => {
    const r = await fetch(BASE + "/");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(r.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("rejects signed-out and forged sessions", async () => {
    expect((await api("/api/holds", { method: "POST", body: JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[0]] }) })).status).toBe(401);
    const forged = await api("/api/holds", { method: "POST", headers: { cookie: "authjs.session-token=" + "f".repeat(64) }, body: JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[0]] }) });
    expect(forged.status).toBe(401);
    const me = await (await fetch(BASE + "/api/me", { headers: { cookie: "authjs.session-token=nope" } })).json();
    expect(me.signedIn).toBe(false);
  });

  it("blocks cross-site and origin-less state changes (CSRF)", async () => {
    const body = JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[0]] });
    expect((await api("/api/holds", { method: "POST", as: "a", origin: "https://evil.example", body })).status).toBe(403);
    expect((await api("/api/holds", { method: "POST", as: "a", origin: null, body })).status).toBe(403);
    expect((await api("/api/checkout", { method: "POST", as: "a", origin: "https://evil.example", body: JSON.stringify({ eventId: INDIE, idemKey: randomUUID() }) })).status).toBe(403);
  });

  it("rejects tampered bodies: client-sent prices, too many seats, seats from another event", async () => {
    const price = await api("/api/holds", { method: "POST", as: "a", body: JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[0]], priceCents: 1 }) });
    expect(price.status).toBe(400);
    const many = await api("/api/holds", { method: "POST", as: "a", body: JSON.stringify({ eventId: INDIE, seatIds: Array.from({ length: 7 }, () => randomUUID()) }) });
    expect(many.status).toBe(400);
    const mixed = await api("/api/holds", { method: "POST", as: "a", body: JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[0], concertSeat] }) });
    expect(mixed.status).toBe(400);
    const junk = await api("/api/holds", { method: "POST", as: "a", body: "{not json" });
    expect(junk.status).toBe(400);
  });

  it("charges the server's price, not anything the client claims", async () => {
    const hold = await api("/api/holds", { method: "POST", as: "a", body: JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[1], indieSeats[2]] }) });
    expect(hold.status).toBe(201);
    const extra = await api("/api/checkout", { method: "POST", as: "a", body: JSON.stringify({ eventId: INDIE, idemKey: randomUUID(), amountCents: 1 }) });
    expect(extra.status).toBe(400); // unknown field rejected outright
    const co = await api("/api/checkout", { method: "POST", as: "a", body: JSON.stringify({ eventId: INDIE, idemKey: randomUUID() }) });
    expect(co.status).toBe(201);
    const { orderId } = await co.json();
    orderOfA = orderId;
    const [row] = await sql`select o.amount_cents as paid, (select sum(s.price_cents) from seats s where s.id in ${sql([indieSeats[1], indieSeats[2]])}) as listed from orders o where o.id = ${orderId}`;
    expect(Number(row.paid)).toBe(Number(row.listed));
  });

  it("never shows one buyer's order to another (404, not 403, so IDs can't be probed)", async () => {
    expect(orderOfA).not.toBe("");
    expect((await api(`/api/orders/${orderOfA}`, { as: "a" })).status).toBe(200);
    expect((await api(`/api/orders/${orderOfA}`, { as: "b" })).status).toBe(404);
    // The order page streams (it has a loading screen), so a missing order renders the not-found
    // page with status 200. What matters is that none of A's order reaches B.
    const page = await (await api(`/orders/${orderOfA}`, { as: "b" })).text();
    expect(page).not.toContain(`Order ${orderOfA.slice(0, 8)}`); // the order header
    expect(page).not.toContain(SEED_EVENTS[1].title); // the event on the order
    expect(page).toMatch(/could not be found|not found/i);
    expect((await api(`/api/orders/${randomUUID()}`, { as: "b" })).status).toBe(404);
    expect((await api(`/api/orders/${encodeURIComponent("' OR 1=1 --")}`, { as: "b" })).status).toBe(404);
    // and B can't complete A's payment through the demo endpoint either
    expect((await api("/api/mock-pay", { method: "POST", as: "b", body: JSON.stringify({ orderId: orderOfA }) })).status).toBe(404);
  });

  it("can't check out without holding seats", async () => {
    const r = await api("/api/checkout", { method: "POST", as: "b", body: JSON.stringify({ eventId: INDIE, idemKey: randomUUID() }) });
    expect(r.status).toBe(409);
  });

  it("can't skip the waiting room by calling the hold API directly", async () => {
    // B never joined the concert's queue.
    const r = await api("/api/holds", { method: "POST", as: "b", body: JSON.stringify({ eventId: CONCERT, seatIds: [concertSeat] }) });
    expect([403, 409]).toContain(r.status);
    if (r.status === 403) expect((await r.json()).code).toBe("QUEUE");
  });

  it("rejects forged payment webhooks", async () => {
    const fake = { type: "payment.succeeded", ref: `pi:${orderOfA}`, amount: 1 };
    const r = await fetch(BASE + "/api/webhooks/payments", { method: "POST", headers: { "content-type": "application/json", "x-mock-signature": "t=1,v1=deadbeef", "stripe-signature": "t=1,v1=deadbeef" }, body: JSON.stringify(fake) });
    expect(r.status).toBe(400);
    const [o] = await sql`select status from orders where id = ${orderOfA}`;
    expect(o.status).toBe("pending");
  });

  it("protects the reconciler endpoint with its secret", async () => {
    expect((await fetch(BASE + "/api/cron/reconcile")).status).toBe(401);
    expect((await fetch(BASE + "/api/cron/reconcile", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("rate-limits floods of hold attempts", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = await api("/api/holds", { method: "POST", as: "b", body: JSON.stringify({ eventId: INDIE, seatIds: [indieSeats[3]] }) });
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
  });

  it("keeps organizer pages closed to buyers", async () => {
    const page = await api("/organizer", { as: "a" });
    expect([307, 404]).toContain(page.status);
    const action = await api("/api/organizer/drop", { method: "POST", as: "a", body: JSON.stringify({ eventId: CONCERT }) });
    expect(action.status).toBe(404);
  });
});
