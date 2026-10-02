# Phase 7 — Testing & Hardening: Audit Report

Scope: IMPLEMENTATION-PLAN.md Phase 7 (E2E, responsive matrix, accessibility, security
checklist, concurrency, edge cases EC-01…EC-24). Payment sandbox (PRD §60) is out of
reach until Midtrans sandbox credentials exist; all payment paths are verified with
MockProvider through the same verification code (signature → provider status API →
idempotent processing).

## Findings and status

| # | Severity | Area | Finding | Status |
|---|---|---|---|---|
| 1 | Medium | Payments / refunds | An order-level refund could also consume Payment-Exception money (and vice versa), allowing the same Rupiah to be recorded as refunded twice. | **Fixed** — exception and counted money are bounded separately; regression test fails on the old code. |
| 2 | Medium | HTTP headers | No Content-Security-Policy (plan §30). | **Fixed** — per-request nonce CSP via `src/proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`); E2E asserts no CSP violations. |
| 3 | Medium | Configuration | MockProvider (customers can "pay" via the test simulator) was allowed in a production build with `PAYMENT_ENV=sandbox`. | **Fixed** — production builds refuse the mock unless `ALLOW_MOCK_PAYMENTS=true` (E2E/staging only). |
| 4 | Medium | Observability | No application log (plan §39); server errors left no traceable reference. | **Fixed** — JSON logger with key-based redaction (tokens, passwords, secrets, cookies, signatures, phone/email, payloads); `instrumentation.ts` logs request errors by digest (path only, no headers/query). |
| 5 | Low | Error handling | No error boundaries; plan §29 requires a generic Indonesian message with a reference. | **Fixed** — `error.tsx`, `admin/error.tsx`, `global-error.tsx` show "Terjadi masalah. Silakan coba lagi." + reference code, never stack traces. |
| 6 | Low | Availability | `/api/uploads/payment-proof` buffered bodies without Content-Length; `/api/tracking` and the webhook had no body cap. | **Fixed** — upload requires Content-Length (411) and ≤ 5 MB + overhead (413); tracking ≤ 4 KB; webhook ≤ 64 KB. |
| 7 | Low | Admin upload | Product photo limit (8 MB) exceeded the 6 MB Server Action body limit (uploads > 6 MB failed with a generic error). | **Fixed** — product photos ≤ 5 MB; unit test keeps the limits consistent. |
| 8 | Low | Accessibility | With streamed metadata (Next 16) the `<title>` could arrive after the body; axe intermittently reported `document-title`. | **Fixed** — metadata resolved before streaming (`htmlLimitedBots`); E2E asserts `<title>` in the initial head. |
| 9 | Low | SEO/privacy | `robots.txt` did not list `/pesanan` (page already `noindex`). | **Fixed**. |
| 10 | Info | Tests | Calendar helper raced the asynchronous availability load (intermittent E2E failure). | **Fixed** — waits for rendered availability. |

## Accepted / deployment-dependent risks (documented, not code defects)

| Severity | Risk | Note / owner |
|---|---|---|
| Medium (deployment) | Rate limits key on the first `X-Forwarded-For` value. Behind a proxy that does not overwrite it, clients could rotate IPs. | Correct on Vercel/standard reverse proxies. Verify with the hosting choice (TD-17, Phase 8). |
| Low | Per-order tracking rate limit (TD-11) lets someone who knows an order number temporarily lock out its tracking for 15 min. | By design (plan requires per-order limits); customer can retry later or use WhatsApp. |
| Low | Invalid-signature webhooks are recorded (plan §16) and can grow `payment_webhook_events`. | Body capped at 64 KB; add hosting-level rate limiting / retention job in Phase 8 if needed. |
| Low | `npm audit`: 4 moderate advisories, all `drizzle-kit` → `@esbuild-kit/*` → `esbuild` ≤ 0.24.2 (dev-server CORS, GHSA-67mh-4wv8-2f99). The lockfile also places it in the production tree because `better-auth` declares `drizzle-kit` as an optional peer. | The advisory concerns esbuild's development server, which the app never starts at runtime (drizzle-kit is only used for `generate`/`check`). `npm audit fix --force` would downgrade drizzle-kit to 0.18 (breaking). Re-check when drizzle-kit drops `@esbuild-kit`. No high/critical advisories. |
| Info | Payment sandbox flow (PRD §60) not executed against a real provider. | Needs Midtrans sandbox server key (env only). Adapter is unit-tested against documented API shapes. |

## Verified areas (no defect found)

- **Authorization:** every admin page and Server Action calls `requireAdmin()` first (static test + mutation check); admin file route, cron (constant-time Bearer), webhook (signature + provider status API), tracking (HMAC-signed cookie bound to order + current code), cross-order access refused; replayed Server Action without session changes nothing.
- **Payments:** QRIS/transfer/Cash/DP/remaining, expiry, duplicate and late webhooks, amount mismatch, exceptions, refunds, reservation behaviour; races: webhook vs sweeper, webhook vs admin cancel, proof approval vs admin cancel — paid amount always equals counted payments.
- **State machine:** exhaustive 5,184-combination oracle test; terminal states final (EC-24).
- **Capacity:** 20/30 concurrent real orders, Manual Order vs website for the last slot, block/override never cancels orders (EC-14).
- **Uploads:** magic-byte types, 5 MB, server-generated keys (no traversal), private bucket, `attachment` + `nosniff` + sandbox CSP.
- **Admin:** Argon2id, ≥ 12-char passwords, login rate limit per IP/email, idle 8 h / absolute 7 d sessions, revocation on password change/deactivation, last-admin protection, audit log for every mutation.
- **Tracking token:** 256-bit, SHA-256 stored, never in URL sent to server, page HTML, WhatsApp text, logs, or audit entries.
- **Responsive & a11y:** public and all admin modules across the full §33 matrix (320–1920 px) with no horizontal overflow; axe without serious/critical violations; skip link and visible focus.

## Mutation sweep (critical guards)

Each guard was broken on purpose and the suite re-run; all mutants were killed:
Selesai without Lunas · expiry during WAITING_VERIFICATION · token always matches ·
webhook trusts body status · webhook without idempotency · upload accepts any type ·
override without reason · admin action without `requireAdmin` · Cash for Pre-Order ·
refund double count (finding #1) · capacity row lock (Phase 3/4).
