import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { REPO } from "@/lib/content";
import { RESULTS as R } from "@/data/results";

export const metadata: Metadata = { title: "Test results", description: "Load, failure and security test results for TicketRush, published as measured." };

const Doc = ({ file, children }: { file: string; children: React.ReactNode }) => (
  <a className="link inline-flex items-center gap-1" href={`${REPO}/blob/main/docs/results/${file}`}>{children}<ArrowUpRight aria-hidden className="size-3.5" /></a>
);

export default function Results() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <p className="eyebrow">Results · {R.date}</p>
        <h1 className="display mt-3 max-w-3xl text-5xl text-balance sm:text-7xl">Measured, not <span className="sticker">promised.</span></h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          {R.load.browsers.toLocaleString("en-IN")} people browsing while {R.load.buyers.toLocaleString("en-IN")} buyers race for {R.load.seats} seats, with the payment gateway failing on purpose. Every number links to its raw write-up, misses included.
        </p>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {R.invariants.map((x, i) => (
            <li key={x.label} className={`rounded-xl border-2 border-ink p-6 shadow-soft ${i === 0 ? "bg-ink text-paper" : "bg-card"}`}>
              <p className={`display text-6xl tabular-nums ${i === 0 ? "text-hot" : ""}`}>{x.value}</p>
              <p className="mt-3 font-semibold">{x.label}</p>
              <p className="mt-1 text-sm opacity-75">{x.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="speed" className="border-y-2 border-ink bg-sunk">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="speed" className="display text-4xl sm:text-5xl">Speed under load</h2>
          <p className="mt-3 max-w-3xl text-muted">On {R.hardware}. The load generator shares the CPUs with the app, so these are a floor, not what the CDN-backed live site shows.</p>
          <div className="card mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <caption className="sr-only">Load test results against targets</caption>
              <thead className="bg-paper font-mono text-xs uppercase text-muted"><tr><th className="px-5 py-3">Measure</th><th className="px-5 py-3">Result</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Verdict</th></tr></thead>
              <tbody className="divide-y-2 divide-line">
                {[
                  ["Requests served", `${R.load.requests.toLocaleString("en-US")} (${R.load.rps.toLocaleString("en-US")}/s)`, "—", "—"],
                  ["Browse p95, 10,000 users", R.load.browseP95, "< 800 ms", "Met"],
                  ["Browse errors", R.load.browseErrors, "< 1%", "Met"],
                  ["Hold seats p95, 3,000 at once", R.load.holdP95, "< 500 ms", "Missed"],
                  ["Checkout p95, 3,000 at once", R.load.checkoutP95, "< 500 ms", "Missed"],
                  ["Checkout p95, isolated (300 buyers)", R.load.isolated.checkoutP95, "< 500 ms", "Met"],
                  ["Admitted → ticket, isolated (median)", R.load.isolated.admittedToTicketMedian, "—", "—"],
                ].map(([m, r, t, v]) => (
                  <tr key={m}><td className="px-5 py-3 font-medium">{m}</td><td className="px-5 py-3 tabular-nums">{r}</td><td className="px-5 py-3 text-muted">{t}</td>
                    <td className="px-5 py-3">{v === "—" ? "—" : <span className={`badge ${v === "Met" ? "bg-ok-soft text-ok" : "bg-hot-soft text-hot"}`}>{v}</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">Faults injected: {R.load.faults}. Full write-up: <Doc file="m7-load-test.md">m7-load-test.md</Doc></p>
        </div>
      </section>

      <section aria-labelledby="sec" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="sec" className="display text-4xl sm:text-5xl">Security</h2>
        <dl className="mt-8 grid grid-cols-3 border-2 border-ink bg-card shadow-soft">
          {[[`${R.security.passed}/${R.security.attacks}`, "attacks failed safely"], [String(R.security.zapHigh), "high-risk ZAP alerts"], [String(R.security.tests), "unit + integration tests"]].map(([v, l], i) => (
            <div key={l} className={`p-4 sm:p-6 ${i ? "border-l-2 border-ink" : ""}`}><dd className="display text-4xl tabular-nums sm:text-5xl">{v}</dd><dt className="mt-1 font-mono text-[11px] uppercase text-muted">{l}</dt></div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted">Forged sessions, cross-site requests, tampered prices, other people&apos;s orders, forged webhooks and floods, run against the production build on every push. Details: <Doc file="m6-security.md">m6-security.md</Doc></p>
      </section>
      <SiteFooter />
    </main>
  );
}
