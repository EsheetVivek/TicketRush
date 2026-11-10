// Turns loadtest/summary.json (k6) and loadtest/verify.json into a Markdown table.
import { existsSync, readFileSync } from "node:fs";

const k6 = existsSync("loadtest/summary.json") ? JSON.parse(readFileSync("loadtest/summary.json", "utf8")) : null;
const v = existsSync("loadtest/verify.json") ? JSON.parse(readFileSync("loadtest/verify.json", "utf8")) : null;
const m = (name) => k6?.metrics?.[name]?.values ?? {};
const ms = (x) => (x == null ? "–" : `${Math.round(x)} ms`);
const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(2)}%`);
const out = ["## TicketRush load test", ""];

if (k6) {
  out.push("| Step | Requests | median | p95 | p99 | max |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const [label, key] of [["Browse (home, events, seat map)", "http_req_duration{scenario:browse}"], ["Join line", "http_req_duration{step:queue}"], ["Seat map (buyers)", "http_req_duration{step:seatmap}"], ["Hold seats", "http_req_duration{step:hold}"], ["Checkout", "http_req_duration{step:checkout}"], ["Pay", "http_req_duration{step:pay}"], ["Order status", "http_req_duration{step:status}"]]) {
    const x = k6.metrics[key];
    if (!x) continue;
    out.push(`| ${label} | ${x.values.count ?? "–"} | ${ms(x.values.med)} | ${ms(x.values["p(95)"])} | ${ms(x.values["p(99)"])} | ${ms(x.values.max)} |`);
  }
  out.push("", `- Total HTTP requests: ${m("http_reqs").count} (${Math.round(m("http_reqs").rate)}/s)`);
  out.push(`- Browse error rate: ${pct(k6.metrics["http_req_failed{scenario:browse}"]?.values.rate)} · checkout-scenario non-2xx rate: ${pct(k6.metrics["http_req_failed{scenario:checkout}"]?.values.rate)} (409 seat conflicts count here by design)`);
  out.push(`- Peak virtual users: ${m("vus_max").max ?? m("vus_max").value}`);
  out.push(`- Holds won: ${m("holds_won").count ?? 0} · seat conflicts retried: ${m("hold_conflicts").count ?? 0} · gave up (sold out): ${m("sold_out_give_ups").count ?? 0}`);
  out.push(`- Paid: ${m("orders_paid").count ?? 0} · ticketed live: ${m("orders_ticketed").count ?? 0} · refunded live: ${m("orders_refunded").count ?? 0} · webhooks deliberately lost: ${m("webhooks_lost").count ?? 0} · gateway errors retried: ${m("gateway_errors").count ?? 0}`);
  out.push(`- Time in line: median ${ms(m("time_in_line_ms").med)}, p95 ${ms(m("time_in_line_ms")["p(95)"])}`);
  out.push(`- Admitted → ticket: median ${ms(m("admitted_to_ticket_ms").med)}, p95 ${ms(m("admitted_to_ticket_ms")["p(95)"])}`);
  out.push(`- Join → ticket (total): median ${ms(m("time_to_ticket_ms").med)}, p95 ${ms(m("time_to_ticket_ms")["p(95)"])}`);
  const th = Object.entries(k6.metrics).filter(([, x]) => x.thresholds).flatMap(([k, x]) => Object.entries(x.thresholds).map(([t, r]) => `${r.ok ? "✅" : "❌"} \`${k}\` ${t}`));
  out.push("", "### Thresholds", "", ...th.map((t) => `- ${t}`));
}
if (v) {
  out.push("", "### After reconciliation (checked in Postgres)", "", "```json", JSON.stringify({ counts: v.counts, checks: v.checks, reconcile: v.reconcile }, null, 2), "```", "", v.ok ? "**All invariants hold.**" : "**An invariant failed.**");
}
console.log(out.join("\n"));
