export const REPO = "https://github.com/EsheetVivek/TicketRush";

// Every claim here is backed by an automated test described in docs/results.
export const GUARANTEES = [
  { stat: "0", unit: "seats sold twice", title: "No seat is sold twice", body: "3,000 buyers racing for 500 seats in one test, and not one seat was held twice. A database uniqueness rule on (event, seat) is the final word on every ticket.", doc: "m2-seat-holds.md" },
  { stat: "5 min", unit: "reconciler cycle", title: "Charged but no ticket? Refunded automatically", body: "A payment that lands after the seat went to someone else is refunded on its own. A webhook that never arrives is caught by a reconciler every 5 minutes.", doc: "m4-reconciler.md" },
  { stat: "2,000", unit: "unique places", title: "A fair waiting room", body: "2,000 people joining at the same moment get 2,000 unique places. The line is enforced on the server, so calling the API can't skip it.", doc: "m5-waiting-room.md" },
  { stat: "30 min", unit: "max hold extension", title: "Gateway outages handled", body: "If payments stop responding, checkout fails fast with a clear message, your seats stay held, and retrying reuses the same payment.", doc: "m3-payments.md" },
];

export const SECURITY = [
  ["Sessions", "Opaque session ID in an httpOnly, SameSite cookie; revocable on the server. No tokens in the browser's storage."],
  ["CSRF and origin checks", "Every state-changing request must come from this site's origin; unknown fields such as a client-sent price are rejected."],
  ["Signed webhooks", "Payment notifications are verified by signature with a 5-minute replay window and processed at most once."],
  ["Field encryption", "Personal fields such as phone numbers are encrypted with AES-256-GCM, on top of the database's own encryption at rest."],
  ["Signed QR tickets", "Each QR code carries the ticket ID and an HMAC-SHA256 signature, so a forged or edited ticket fails at the gate."],
  ["Private orders", "Every order lookup is filtered by the signed-in user. Someone else's order looks exactly like one that doesn't exist."],
] as const;

export const STACK = ["Next.js App Router", "TypeScript", "Postgres (Neon)", "Drizzle ORM", "Auth.js", "Stripe test mode", "Tailwind CSS", "motion", "Vitest", "Vercel"];

export const FAQ = [
  { q: "Is this real money?", a: "No. Payments run in test mode: either Stripe's test environment (card 4242 4242 4242 4242) or a built-in test gateway. Nothing is ever charged." },
  { q: "What happens if something goes wrong after I pay?", a: "If tickets can't be issued, for example because the seat was taken while your payment was processing, the full amount is refunded automatically and your order shows the refund." },
  { q: "How long is a hold?", a: "10 minutes from the moment you hold your seats. The countdown is on the page. If payments are briefly down, the hold is extended so you don't lose your seats." },
  { q: "Why is there a queue?", a: "When thousands of people arrive at once, a line keeps it fair: places are first come, first served, and people are let in at a steady rate so checkout stays fast for everyone." },
];
