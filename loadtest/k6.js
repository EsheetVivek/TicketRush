// TicketRush load test (k6). Two scenarios run at the same time against one production build:
//  - browse:   ramps to 10,000 virtual users reading the landing page, event list and seat map
//  - checkout: 3,000 signed-in buyers start at the same moment and race for 500 seats:
//              join the line → hold 1–2 seats (retry on conflict) → checkout → pay → wait for tickets
// The payment gateway is the mock with fault injection (MOCK_FAULTS), so some payments time out
// before or after charging; the verify step then checks that no one was charged without a ticket.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const EVENT = __ENV.EVENT_ID;
const BROWSE_VUS = Number(__ENV.BROWSE_VUS || 10000);
const BUYERS = Number(__ENV.BUYERS || 3000);
const tokens = new SharedArray("tokens", () => JSON.parse(open("./.tokens.json")));

export const options = {
  discardResponseBodies: false,
  scenarios: {
    browse: {
      executor: "ramping-vus", exec: "browse", startVUs: 0,
      stages: [{ duration: __ENV.RAMP || "60s", target: BROWSE_VUS }, { duration: __ENV.HOLD || "120s", target: BROWSE_VUS }, { duration: "20s", target: 0 }],
      gracefulRampDown: "10s",
    },
    checkout: {
      executor: "per-vu-iterations", exec: "checkout", vus: BUYERS, iterations: 1, startTime: __ENV.RAMP || "60s", maxDuration: "6m",
    },
  },
  thresholds: {
    "http_req_duration{scenario:browse}": ["p(95)<800"],
    "http_req_failed{scenario:browse}": ["rate<0.01"],
    "http_req_duration{step:hold}": ["p(95)<500"],
    "http_req_duration{step:checkout}": ["p(95)<500"],
    // reported only (always pass), so the summary has a breakdown per step
    "http_req_duration{step:queue}": ["max>=0"], "http_req_duration{step:seatmap}": ["max>=0"],
    "http_req_duration{step:pay}": ["max>=0"], "http_req_duration{step:status}": ["max>=0"],
    "http_req_failed{scenario:checkout}": ["rate>=0"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const holdsWon = new Counter("holds_won");
const holdConflicts = new Counter("hold_conflicts");
const soldOutGiveUps = new Counter("sold_out_give_ups");
const ordersPaid = new Counter("orders_paid");
const ticketed = new Counter("orders_ticketed");
const refunded = new Counter("orders_refunded");
const gatewayErrors = new Counter("gateway_errors");
const lostWebhooks = new Counter("webhooks_lost");
const timeToTicket = new Trend("time_to_ticket_ms", true);
const timeInLine = new Trend("time_in_line_ms", true);
const shopToTicket = new Trend("admitted_to_ticket_ms", true);

export function browse() {
  const ip = `10.1.${Math.floor(exec.vu.idInTest / 250)}.${exec.vu.idInTest % 250}`;
  const h = { headers: { "x-forwarded-for": ip }, tags: { step: "browse" }, responseType: "none" };
  const r1 = http.get(`${BASE}/`, h);
  check(r1, { "home 200": (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
  check(http.get(`${BASE}/events`, h), { "events 200": (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
  check(http.get(`${BASE}/api/events/${EVENT}/seats`, h), { "seats 200": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
}

export function checkout() {
  const i = exec.vu.idInTest - 1;
  const token = tokens[i % tokens.length];
  const headers = { cookie: `authjs.session-token=${token}`, origin: BASE, "content-type": "application/json", "x-forwarded-for": `10.2.${Math.floor(i / 250)}.${i % 250}` };
  const started = Date.now();
  const post = (path, body, step) => http.post(`${BASE}${path}`, JSON.stringify(body), { headers, tags: { step } });

  const joined = post(`/api/queue/${EVENT}`, {}, "queue");
  check(joined, { "joined line": (r) => r.status === 200 });
  // Wait in line until admitted, polling like the waiting-room page does.
  let admitted = joined.status === 200 && joined.json("admitted");
  for (let k = 0; !admitted && k < 120; k++) {
    sleep(2);
    const st = http.get(`${BASE}/api/queue/${EVENT}`, { headers, tags: { step: "line_poll" } });
    admitted = st.status === 200 && st.json("admitted");
  }
  if (!admitted) { check(null, { "admitted from line": () => false }); return; }
  timeInLine.add(Date.now() - started);
  const shopStart = Date.now();

  let hold = null;
  for (let attempt = 0; attempt < 4 && !hold; attempt++) {
    const map = http.get(`${BASE}/api/events/${EVENT}/seats`, { headers, tags: { step: "seatmap" } });
    const seats = (map.json("seats") || []).filter((s) => s.status === "available");
    if (!seats.length) { soldOutGiveUps.add(1); return; }
    const want = 1 + (i % 2);
    const start = Math.floor(Math.random() * seats.length);
    const pick = seats.slice(start, start + want).map((s) => s.id);
    const r = post("/api/holds", { eventId: EVENT, seatIds: pick }, "hold");
    if (r.status === 201) { hold = r.json("hold"); holdsWon.add(1); }
    else if (r.status === 409) { holdConflicts.add(1); sleep(Math.random() * 0.5); }
    else { check(r, { "hold ok or conflict": () => false }); return; }
  }
  if (!hold) { soldOutGiveUps.add(1); return; }

  const idemKey = uuid();
  let co = post("/api/checkout", { eventId: EVENT, idemKey }, "checkout");
  for (let retry = 0; co.status === 503 && retry < 3; retry++) { gatewayErrors.add(1); sleep(1); co = post("/api/checkout", { eventId: EVENT, idemKey }, "checkout"); }
  if (co.status !== 201) { check(co, { "checkout created": () => false }); return; }
  const orderId = co.json("orderId");

  let pay = post("/api/mock-pay", { orderId }, "pay");
  for (let retry = 0; pay.status >= 500 && retry < 3; retry++) { gatewayErrors.add(1); sleep(1); pay = post("/api/mock-pay", { orderId }, "pay"); }
  if (pay.status === 200 || pay.status === 202) ordersPaid.add(1); else gatewayErrors.add(1);
  if (pay.status === 202) lostWebhooks.add(1);

  for (let k = 0; k < 20; k++) {
    const s = http.get(`${BASE}/api/orders/${orderId}`, { headers, tags: { step: "status" } }).json("status");
    if (s === "ticketed") { ticketed.add(1); timeToTicket.add(Date.now() - started); shopToTicket.add(Date.now() - shopStart); return; }
    if (s === "refunded" || s === "refund_pending") { refunded.add(1); return; }
    sleep(0.5);
  }
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });
}

export function handleSummary(data) {
  return { "loadtest/summary.json": JSON.stringify(data, null, 2), stdout: "\nk6 summary written to loadtest/summary.json\n" };
}
