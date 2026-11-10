# M6 — Security: attacks against the running app

**Date:** 2026-11-10 · **Runs on:** every push (CI job `security`), against the production build.

## What's attacked, and the result

The suite (`e2e/security.e2e.test.ts`) starts from what an outsider controls: cookies, headers and
request bodies. All 12 pass in CI.

| Attack | Expected | Result |
| --- | --- | --- |
| No session / forged session cookie on hold, checkout, `/api/me` | 401, signed out | Pass |
| Cross-site POST (foreign `Origin`) and POST with no `Origin` | 403 | Pass |
| Client-sent price on hold or checkout (`priceCents`, `amountCents`) | 400 (unknown fields rejected) | Pass |
| 7 seats in one hold, seats from another event, malformed JSON | 400 | Pass |
| Charge amount vs listed seat prices | Server's price, exactly | Pass |
| Buyer B reads buyer A's order (API) | 404, same as a missing order | Pass |
| Buyer B opens A's order page | Not-found page, none of A's data | Pass |
| Buyer B completes A's payment via the demo endpoint | 404 | Pass |
| SQL-injection-shaped order ID | 404 (UUID validated first) | Pass |
| Checkout without holding seats | 409 | Pass |
| Hold on a waiting-room event without being admitted | 403 `QUEUE` | Pass |
| Forged payment webhook signature | 400, order unchanged | Pass |
| Reconciler cron without / with a wrong bearer token | 401 | Pass |
| 14 rapid hold attempts | 429 rate limit | Pass |
| Buyer opens organizer page or calls the drop API | 404 | Pass |
| Security headers (CSP, HSTS, nosniff, frame-ancestors, no `X-Powered-By`) | Present | Pass |

## OWASP ZAP baseline scan

Runs after the suite on every push; the job fails on any High-risk alert.

| Risk | Alert | Decision |
| --- | --- | --- |
| High → accepted | PII Disclosure: `4242 4242 4242 4242` on `/` | Stripe's public test card, shown on purpose in the FAQ. The CI filter drops only an alert whose every instance is that exact number; any other PII still fails the build. |
| Medium → accepted | CSP `script-src 'unsafe-inline'` | Next.js bootstraps with inline scripts. A nonce-based CSP would make every page render per request, which removes the CDN caching that keeps the site fast under load (see m7). Scripts are still limited to this origin and Stripe. |
| Medium → accepted | CSP `style-src 'unsafe-inline'` | Animations set inline styles. Styles can't run code. |
| Low → accepted | Cross-Origin-Embedder-Policy missing | `require-corp` would block Stripe's payment iframe and Google/GitHub avatars. `Cross-Origin-Resource-Policy: same-origin` and `Cross-Origin-Opener-Policy: same-origin` are set. |

## Headers sent on every response

`Content-Security-Policy` (scripts/frames: self + Stripe; `object-src 'none'`; `frame-ancestors 'none'`;
`form-action` self + the OAuth providers), `Strict-Transport-Security` (2 years, preload),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera, mic, location off; payment for Stripe only), `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`.

## Also in place (earlier milestones)

AES-256-GCM field encryption, HMAC-signed QR tickets, signed + deduplicated webhooks, idempotency
keys, per-user and per-IP rate limits, Zod `.strict()` validation on every write, an audit log of every
money-moving and organizer action, `npm audit` in CI.
