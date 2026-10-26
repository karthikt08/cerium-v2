# Deep UI audit — October 2026

Audited the current Cerium site and workspace, including the Overview contrast and collapsible sidebar changes, using disposable accounts and an isolated in-memory database.

## Fixed defects

- Public navigation clipped the trial button or hid links at narrow widths. The header now wraps while preserving every destination.
- Highlighted headings, the pricing grid, legal-page email addresses, and homepage invoice preview rows overflowed small screens. They now wrap within the available space.
- Long workspace section names pushed topbar controls off 320px screens. The breadcrumb now truncates without displacing account controls.
- Dialog backdrops hid the native pointer even when the custom cursor was inactive. Cursor hiding now requires the active custom cursor; forced-colors mode uses the native pointer too.
- Nested missing URLs loaded the 404 page with broken relative assets. Its asset paths now resolve from the site root.
- Valid CSV/XLSX contact imports without a Stage column failed downstream validation. Missing or blank stages now default to New; explicit invalid stages still fail validation.
- New lead, follow-up, invoice, and review dates could use the device or UTC day instead of the business day. Defaults and review request dates now respect the business time zone.
- A temporary waitlist account lookup failure redirected signed-in users to signup. Strict error handling now exposes the existing retry control and recovers without losing the session.
- Small operational labels and placeholder text were faint. Their contrast is strengthened without replacing the existing page design.

## Validation

- **705 Node tests passed**, zero failures, cancellations, or skips.
- **107 page/viewport inspections passed** at 1440, 768, 390, and 320px widths. Coverage includes public pages, all 12 workspace sections, and signed-in waitlist and onboarding/entry screens. No unexpected page overflow, clipped inspected content, unnamed inspected controls, missing local assets, broken collected internal links, or uncaught page errors were reported.
- **23 browser workflow checks passed**: authentication and password recovery; business-date defaults; lead CRUD, search and pipeline; follow-up completion; validation and failed-save retry; cursor behavior in dialogs, text inputs, reduced motion and forced colors; spreadsheet import and deduplication; estimate acceptance and conversion; crew and completed jobs; invoice preview, print and paid records; reminder scheduling/cancellation; review status; marketing tabs and draft retention; assistant links; settings, export and delete cancellation; mobile navigation; desktop sidebar persistence and mobile isolation; India invoice dialogs; expired-trial restrictions; contact-form validation/email handoff; waitlist retry/join/export/delete cancellation/logout; browser errors.
- The existing business-setup browser suite passed all 12 recorded checks, including failed-request recovery, offline preview/resume, stale-tab protection, and country-specific onboarding.
- Desktop/mobile screenshots were visually reviewed. JavaScript parsing, whitespace checks and the repository secret scanner passed.

## Repeat the browser checks

Install Playwright in the QA environment (or provide it through `CODEX_PRIMARY_RUNTIME_NODE_MODULES`) and install its Chromium browser. Optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a compatible local Chromium executable.

```sh
npm test
node scripts/check-secrets.js
node scripts/qa-ui-audit.mjs
node scripts/qa-ui-workflows.mjs
node scripts/qa-business-setup.mjs
```

The new scripts write JSON results and screenshots under `output/ui-audit` and `output/ui-workflows`; `UI_AUDIT_OUTPUT` overrides each destination. They exit nonzero when a check fails. They use synthetic data and do not modify production records.

## Scope limits

Browser execution used Chromium. Safari/Firefox and physical-device behavior were not exercised. External font downloads were disabled in the new browser checks. Real Google OAuth, SMS delivery, SMTP delivery and payment-provider transactions were not performed; local tests cover their application behavior and mocked/provider contract cases. The audit verifies the listed routes, states and workflows, not every possible data combination or external service condition.
