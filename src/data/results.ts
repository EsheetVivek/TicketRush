/** Published test results (from docs/results). Shown on /results; update only from a real run. */
export const RESULTS = {
  date: "2026-11-10",
  hardware: "1 GitHub runner: 4 vCPU (AMD EPYC 7763), 16 GB, shared by k6, nginx, 3 app instances and Postgres",
  load: {
    browsers: 10_000, buyers: 3_000, seats: 500, requests: 651_764, rps: 3_122, browseErrors: "0%",
    browseP95: "581 ms", holdP95: "4.4 s", checkoutP95: "5.2 s",
    isolated: { admittedToTicketMedian: "626 ms", checkoutP95: "492 ms" },
    faults: "3% gateway timeouts before charge, 3% lost responses after charge, 5% lost webhooks",
  },
  invariants: [
    { label: "Seats sold twice", value: "0", note: "across 3 full runs" },
    { label: "Charged without a ticket", value: "0", note: "after the reconciler ran" },
    { label: "Lost webhooks settled", value: "51 / 51", note: "15 + 16 + 20 across the runs" },
    { label: "Orders left unsettled", value: "0", note: "every checkout ticketed, refunded or expired" },
  ],
  security: { attacks: 12, passed: 12, zapHigh: 0, tests: 46 },
};
