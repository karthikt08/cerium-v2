# CERIUM debugging session 2 — 25 October 2026

This pass started from merged PR #14, main commit
`95114a76a6d6aaad9f6b28911fecd734ab32d30b`. It focused on interactions between
features, alternate URLs, invalid inputs, and preservation of financial history.
All accounts, databases, provider responses, and browser payments were test fixtures.

## Findings and repairs

| Area | Reproduced behavior | Repair |
| --- | --- | --- |
| Route guards | In IP-enforced signup mode, case and trailing-slash aliases could avoid region classification. Percent-encoded filenames could retrieve the workspace shell before login or onboarding. Private workspace APIs remained protected. | Region checks now match Express's route aliases. The shell guard checks decoded, normalized paths before static delivery and disables shell caching. |
| Unsubscribe links | Node's permissive base64 decoder accepted a valid signature followed by padding and HTML, which was reflected in the confirmation form. This demonstrated HTML injection, not successful JavaScript execution through the CSP. | Only the canonical generated URL-safe token format is accepted. Altered signatures and markup are rejected. |
| Issued invoices | Editing notes could replace saved supplier GST/UPI details with current profile values. A corrected calculation could also rewrite an older issued total. | Issued supplier/payment snapshots and unchanged monetary amounts remain historical records. Explicit pricing or tax changes still recalculate. Drafts can adopt current profile details. |
| Invoice editing | Resubmitting an unchanged summary amount could collapse a fractional line item. Unchanged terms overwrote custom due dates, while issue-date changes were accepted but ignored. | Unchanged quantities/rates and custom due dates survive edits. Explicit issue-date and payment-term changes persist and calculate the corresponding due date. |
| Recorded payments | Editing a matched invoice could change its total or mark it unpaid while leaving its deposit matched. | A linked deposit protects the invoice's paid status and total. Nonfinancial edits remain available. |
| Cancellation and paid access | Cancelling a mandate could immediately revoke a future paid-through period. An active provider response was reported as successful cancellation. | Previously granted paid access remains until its original expiry. Cancellation must be confirmed by the provider; otherwise the request reports an error. |
| Returning customers | Reauthorization after an expired trial scheduled another 15-day wait even though the trial clock could not restart. | Returning customers retain the original trial deadline. Billing resumes after remaining trial/paid access, or a short provider setup interval when both have ended. Checkout copy no longer promises another trial. |
| Cancellation UI | Halted and paused mandates could block another authorization while Settings offered no cancellation action. | Every nonterminal mandate has a cancellation control. The confirmation explains that earned trial/paid access is retained. |
| Quote → job → invoice | A quote's customer email was lost when it had no linked lead, preventing follow-up on the generated invoice. | Jobs store customer email and pass it to the invoice. Quote conversion copies the email, and the job form supports it. Existing converted jobs recover the email once during migration. |
| Input validation | Profile objects/nulls caused server errors; job billing accepted coerced booleans, arrays, and nulls; checkout identifiers were not validated before storage access. | Invalid values produce client errors before mutation. A matrix of 54 malformed bodies covers nine business endpoints and verifies that no records are created. |
| Dates and money | Impossible reminder dates were silently normalized. Floating-point GST arithmetic rejected some valid two-decimal inputs and rounded some half-paisa amounts down. Rounded displayed rows could disagree with the saved document total. | Calendar dates are checked exactly. GST uses integer paise/rate arithmetic. Invoice and public-quote previews disclose a rounding adjustment when needed, using the saved total. |

## Evidence and validation

- **20 new automated regression scenarios failed before their corresponding fixes.**
  A separate real-browser failure reproduced the missing halted-subscription
  cancellation control. Extra tests cover related boundaries and migration behavior.
- **436 tests passed; 0 failed; 0 skipped**, including 25 added tests.
  Local command: `node --test --test-reporter=tap --test-concurrency=2`
  on Node 24.22.1/Linux.
- **67 headless Chromium checks passed** at 1440 × 1000 and 390 × 844 for
  US/USD and India/INR accounts. These cover all 11 workspace sections, invoice
  creation and editing, explicit job-draft replacement, customer quote approval,
  job completion with email retention, issued GST snapshots, rounding display,
  cancellation after a halt, and the standalone export.
- Checked pages produced no uncaught JavaScript errors or document-wide overflow
  during navigation. Viewport checks are not physical-device testing.
- The new job-email migration recovers existing quote emails, passes SQLite
  integrity and foreign-key checks, and does not overwrite later intentional edits
  when the database is reopened.
- All **80 JavaScript files** pass syntax checks; the secret scan and diff whitespace
  checks pass. The dependency audit reports **0 known vulnerabilities**. No
  dependencies were added or changed in this pass.

## Deployment and remaining verification

The automatic additive migration introduces `jobs.customer_email`. Back up the
deployed SQLite database before rollout. Existing converted jobs are backfilled
only when that column is first added; existing invoices and money are not rewritten.

Razorpay, Google, phone verification, GeoIP, and SMTP boundaries were exercised
with controlled responses. No production records were changed and no real charge,
SMS, or email was sent. Real provider configuration and end-to-end delivery remain
deployment checks. Safari, Firefox, and physical devices were not covered.

The pull request triggers the existing Node 22 Ubuntu/Windows CI matrix. See its
checks for the result against the published commit. This is a tested set of repairs,
not a guarantee that every possible defect has been eliminated.
