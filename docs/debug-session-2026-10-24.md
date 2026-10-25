# CERIUM debugging session — 24 October 2026

Source reviewed: `karthikt08/cerium-v2`, main commit
`d50bc2192908bde0a952178b851ce8b7d983dae7`. All checks used isolated accounts
and temporary databases. No production records, payments, or messages were changed.

## Reproduced problems and fixes

| Area | Failure | Result |
| --- | --- | --- |
| Razorpay adapter | Server configuration used different credential property names from the real adapter, leaving API authentication and webhook verification unconfigured. | Canonical configuration now reaches the adapter; mocked HTTP authentication and real HMAC checks cover the integration boundary. Requests have a 10-second timeout. |
| Billing lifecycle | Repeated reads could extend expired subscriptions; delayed events and older checkouts could override current access. Overlapping checkout requests could create duplicate subscriptions. | Paid access requires a confirmed future paid-through date. Terminal states, event ordering, obsolete checkouts, payment replay, and concurrent billing changes are guarded. |
| Account deletion | Only the latest mandate was cancelled, and halted mandates were skipped. | Every nonterminal mandate must be cancelled successfully before deletion. |
| Account security | An unverified email signup could retain its password and sessions after the verified owner signed in through Google, or claim a configured administrator email. | Verified Google linking revokes unverified credentials and sessions; conflicting Google identities are rejected; admin access requires a verified email. |
| Password recovery | Production reported success without sending a reset email. | Requests use the explicitly configured SMTP sender. Missing configuration and delivery failures produce visible errors. Successful reset revokes sessions and verifies email ownership. |
| Financial records | Floating-point rounding, inconsistent item validation, and summary-field precedence could produce incorrect totals or overwrite line edits. | A shared integer calculation handles invoice, quote, and job totals. Invoice validation and transactional writes prevent malformed or partial records. |
| Bank matching | A nonexistent or foreign transaction could mark an invoice paid; deleted invoices left dangling references. | Matching requires an owned, equal-value deposit. Repeat confirmation is safe, double matching is rejected, and deletion clears references transactionally. |
| Jobs and linked records | Native date inputs with zero seconds were rejected; deleted job invoices had no recovery action; deleted leads left jobs uneditable. | Whole-minute input variants normalize safely. Completed jobs offer an explicit replacement draft. Lead deletion preserves and detaches dependent records. |
| Request handling | The 2 KB JSON limit rejected valid documents containing 20 line items and notes; malformed business fields could become server errors. | Business-document endpoints allow up to 64 KB with field validation; authentication retains its smaller limit. |
| Reminders and SMTP | Reminder eligibility used a different trial deadline; TLS SNI was misspelled, handshake timeouts could hang, and long Unicode subjects exceeded MIME limits. | Eligibility uses the exact trial deadline. TLS connection handling and UTF-8 subject folding are covered by transport tests. |
| Standalone preview | Concatenated ES modules, missing styles, and an unavailable billing-identity call prevented the export from loading. | The export embeds scoped modules and all workspace styles and supplies a safe demo billing identity. Connected-only operations return an explanatory error. |
| Dependencies | `npm audit` reported one high-severity body-parser advisory. | The lockfile installs body-parser 2.4.0 and qs 6.16.1. The subsequent audit reported zero vulnerabilities. Direct dependency versions are unchanged. |

The dependency advisory is [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828).
SMTP header folding follows [RFC 2047](https://www.rfc-editor.org/rfc/rfc2047.html).

## Validation

- A clean `npm ci --no-audit --no-fund` completed successfully.
- Full suite: **411 passed, 0 failed, 0 skipped**, using
  `node --test --test-reporter=tap --test-concurrency=2` on Node 24.22.1/Linux.
- The first ten new regression cases were run against the original source and
  failed before the fixes. Additional cases cover identity binding, production
  recovery configuration, billing concurrency, obsolete checkouts, transaction
  rollback, double matching, and SMTP behavior.
- All **78 JavaScript files** passed `node --check`.
- `npm run check:secrets` passed, and `npm audit --omit=dev --json` reported zero
  known vulnerabilities after the locked dependency update.
- Real headless Chromium 153 checks passed at **1440 × 1000** and **390 × 844**
  for **both US/USD and India/INR** accounts: all 11 workspace sections rendered
  without uncaught JavaScript errors or document-wide horizontal overflow.
- At each edition/viewport combination, browser workflows created an invoice,
  recovered a deleted completed-job draft, opened its preview, edited its line
  item, and verified the persisted amount. The standalone file export also loaded
  and navigated successfully. Total recorded browser checks: **49**.

## Deployment notes and limits

- The existing GitHub Actions workflow runs the Node 22 suite on Ubuntu and
  Windows when the pull request opens; local results above are from Linux.
- No live Razorpay charge, Google authorization, phone verification, GeoIP lookup,
  or SMTP delivery was performed. Provider requests and callbacks were exercised
  with controlled test responses. Complete the existing production launch checks
  in `SETUP.md` using the intended provider configuration.
- Password recovery now uses the SMTP variables documented in `SETUP.md` and
  `.env.example`. The web process does not start the invoice-reminder worker.
- Subscription event ordering adds an automatic, non-destructive
  `recurring_subscriptions.last_event_at` column. Back up the deployed SQLite
  database before deploying, as for any schema update.
- Billing request serialization applies within one web process. Multiple web
  processes sharing an account would require a shared lock or provider-level
  idempotency before scaling beyond the current single-process deployment.
- Browser checks cover Chromium at desktop and mobile viewport sizes, not physical
  devices or Safari/Firefox. This session addresses the reproduced failures; it
  is not a claim that every possible defect or security issue has been eliminated.
