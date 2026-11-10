/**
 * Times the buyer's hot path end to end over HTTP: hold → checkout → mock pay (tickets issued).
 *
 *   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres@localhost:5433/ticketrush \
 *     npx tsx scripts/bench-flow.ts [flows=200] [label]
 *
 * Runs `flows` buyers one after another, then the same number all at once, and prints p50/p95 for
 * each step (client-observed wall time, plus the server's own `total`/`db` from Server-Timing when
 * the server sends it). LOCAL DATABASES ONLY: it wipes orders, holds and tickets between runs.
 */
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL_ = process.env.DATABASE_URL ?? "";
const N = Number(process.argv[2] ?? 200);
const LABEL = process.argv[3] ?? "run";
const EVENT = "6f1c1d0e-5a3b-4c55-9a0e-6b2d1e000001"; // Monsoon Beats Live: 500 seats, waiting room on

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(URL_)) {
  console.error("Refusing to run: DATABASE_URL must point at a local database (this script deletes orders).");
  process.exit(1);
}
const sql = postgres(URL_, { max: 4, onnotice: () => {} });

type Step = "hold" | "checkout" | "pay";
interface Sample { wall: Record<Step, number>; server: Partial<Record<Step, { total?: number; db?: number }>>; total: number; ok: boolean }

async function reset() {
  await sql`delete from tickets`; await sql`delete from refunds`; await sql`delete from order_items`;
  await sql`delete from payment_events`; await sql`delete from orders`; await sql`delete from seat_holds`;
  await sql`delete from mock_payments`; await sql`delete from audit_log`;
  await sql`delete from queue_entries where user_id like 'bench-%'`;
  await sql`delete from sessions where user_id like 'bench-%'`;
  await sql`delete from users where id like 'bench-%'`;
}

async function makeUsers(n: number) {
  const users = Array.from({ length: n }, (_, i) => ({ id: `bench-${i}`, email: `bench-${i}@bench.local`, token: randomUUID() }));
  await sql`insert into users ${sql(users.map((u) => ({ id: u.id, email: u.email })))}`;
  const expires = new Date(Date.now() + 86_400_000);
  await sql`insert into sessions ${sql(users.map((u) => ({ session_token: u.token, user_id: u.id, expires })))}`;
  return users;
}

function parseTiming(h: string | null) {
  const out: { total?: number; db?: number } = {};
  for (const part of (h ?? "").split(",")) {
    const m = part.trim().match(/^(\w+);dur=([\d.]+)/);
    if (m && (m[1] === "total" || m[1] === "db")) out[m[1]] = Number(m[2]);
  }
  return out;
}

async function call(path: string, token: string, ip: string, body: unknown) {
  const t = performance.now();
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, Cookie: `authjs.session-token=${token}`, "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json, ms: performance.now() - t, timing: parseTiming(r.headers.get("server-timing")) };
}

async function flow(u: { token: string }, i: number, seatId: string): Promise<Sample> {
  const ip = `10.9.${Math.floor(i / 250)}.${i % 250}`;
  const start = performance.now();
  const h = await call("/api/holds", u.token, ip, { eventId: EVENT, seatIds: [seatId] });
  if (!h.ok) throw new Error(`hold ${h.status} ${JSON.stringify(h.json)}`);
  const c = await call("/api/checkout", u.token, ip, { eventId: EVENT, idemKey: randomUUID() });
  if (!c.ok) throw new Error(`checkout ${c.status} ${JSON.stringify(c.json)}`);
  const p = await call("/api/mock-pay", u.token, ip, { orderId: c.json.orderId });
  if (!p.ok || p.json.result !== "ticketed") throw new Error(`pay ${p.status} ${JSON.stringify(p.json)}`);
  return {
    wall: { hold: h.ms, checkout: c.ms, pay: p.ms },
    server: { hold: h.timing, checkout: c.timing, pay: p.timing },
    total: performance.now() - start,
    ok: true,
  };
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const r1 = (x: number) => Math.round(x * 10) / 10;

function summarise(name: string, samples: Sample[], wallMs: number) {
  const row: Record<string, unknown> = { mode: name, flows: samples.length, wallSeconds: r1(wallMs / 1000) };
  for (const s of ["hold", "checkout", "pay"] as Step[]) {
    row[`${s}_p50`] = r1(pct(samples.map((x) => x.wall[s]), 50));
    row[`${s}_p95`] = r1(pct(samples.map((x) => x.wall[s]), 95));
    const st = samples.map((x) => x.server[s]?.total).filter((v): v is number => v != null);
    const sd = samples.map((x) => x.server[s]?.db).filter((v): v is number => v != null);
    if (st.length) { row[`${s}_server_p50`] = r1(pct(st, 50)); row[`${s}_server_p95`] = r1(pct(st, 95)); }
    if (sd.length) { row[`${s}_db_p50`] = r1(pct(sd, 50)); row[`${s}_db_p95`] = r1(pct(sd, 95)); }
  }
  row.flow_p50 = r1(pct(samples.map((x) => x.total), 50));
  row.flow_p95 = r1(pct(samples.map((x) => x.total), 95));
  return row;
}

async function prepare() {
  await reset();
  const users = await makeUsers(N);
  const seats = await sql<{ id: string }[]>`select id from seats where event_id = ${EVENT} order by row, number limit ${N}`;
  // Join the waiting room up front (not timed); the timed hold still runs the server-side admission check.
  for (let i = 0; i < users.length; i++) {
    const r = await fetch(`${BASE}/api/queue/${EVENT}`, { method: "POST", headers: { Origin: BASE, Cookie: `authjs.session-token=${users[i].token}`, "x-forwarded-for": `10.8.${Math.floor(i / 250)}.${i % 250}` } });
    if (!r.ok) throw new Error(`queue join ${r.status}`);
  }
  return { users, seats: seats.map((s) => s.id) };
}

async function main() {
  // Warm up the server (JIT, connection pool) so the first sample isn't a cold start.
  { const { users, seats } = await prepare(); for (let i = 0; i < 10; i++) await flow(users[i], i, seats[i]); }

  const results = [];
  {
    const { users, seats } = await prepare();
    const t = performance.now();
    const samples: Sample[] = [];
    for (let i = 0; i < N; i++) samples.push(await flow(users[i], i, seats[i]));
    results.push(summarise("sequential", samples, performance.now() - t));
  }
  {
    const { users, seats } = await prepare();
    const t = performance.now();
    const samples = await Promise.all(users.map((u, i) => flow(u, i, seats[i])));
    results.push(summarise("concurrent", samples, performance.now() - t));
  }
  const [{ tickets }] = await sql<{ tickets: number }[]>`select count(*)::int as tickets from tickets`;
  console.log(JSON.stringify({ label: LABEL, at: new Date().toISOString(), base: BASE, ticketsAfterConcurrentRun: tickets, results }, null, 2));
  await reset();
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
