# CERIUM currency audit — 2026-10-23

## Goal
One currency for new contractor business operations: USD (dollars). Do not
silently convert or relabel already-entered financial values.

## Production application findings
Express serves `public/`, not `demos/`. Reviewed `public/` pages, JavaScript,
styles, `server/`, configuration, and the main regression tests.

1. **No literal rupee glyph** remains in the active frontend sources.
   An automated test now checks all deployed HTML, CSS and JavaScript files.
2. **New user defaults and plan settings** use USD.
   `users.currency` defaults to `USD`, server configuration rejects an
   alternative `CURRENCY`, signup uses dollars, and the monthly price is
   displayed as `$20`.
3. **Read-only historical exception:** old accounts whose saved currency is
   `INR` must still display original, recorded amounts faithfully. Existing
   quotes have their own currency snapshot and must never be relabeled.
4. **Legacy write prevention:** active API middleware now rejects new business
   writes for non-USD workspaces (HTTP 409 / `currency_review_required`).
   Reads, data export and deliberate Settings → Clear workspace remain available.
   The dashboard clearly explains the reason; new payment authorization is
   unavailable for legacy non-USD accounts.
5. **Empty historical account upgrade:** when SQLite opens, an INR workspace
   without financial or priced-work history is updated to USD. An owner can
   alternatively export then explicitly clear disposable workspace data to
   start fresh, unless payment/subscription history requires review.
6. **Zero balances** on the dashboard display `$0.00` even in an old
   account. Nonzero historical balances preserve their actual denomination.

## Exceptions retained intentionally
- `public/js/workspace-model.js`, `public/js/jobs-page.js`,
  `public/js/quotes-page.js`, and `server/app.js` still recognize INR when
  **displaying genuinely historical amounts**. Deleting these branches would
  make old INR data look like dollars, which is financially incorrect.
- `server/db.js` and `server/quotes.js` still recognize historical currency
  and constrain migration; explicit legacy fixtures in `test/` verify safety.
- `demos/webapp-v2/` is an **archival, unserved snapshot** which still has
  original India/INR controls and a bundled preview. It is not loaded by the
  production `public/` app or Express static middleware. Do not deploy or
  link this stale snapshot as the commercial interface.
- `public/terms.html` still states Indian governing law. This is a legal
  review issue, **not a currency-display bug**. It must not be silently changed.

## QA commands

```cmd
npm test
node --test test/currency-audit.test.js test/us-market.test.js
```

To inspect existing currency flags in a real database, use a trusted local
SQLite tool (never paste user emails or invoice records into chat) and review
`users.currency` and `quotes.currency`. This GitHub change does not remotely
access or alter the user's local database.

### Safely making a legacy demo start in dollars
Export data from Settings first. If all old work is disposable test data,
choose **Clear workspace**, confirm the destructive operation, then restart
or reload. Billing history blocks automatic switching. For valuable existing
records, contact support for a verified migration/re-entry strategy. Never
apply a guessed INR-to-USD exchange rate or automatically relabel ₹1,000 as $1,000.

## Verification status
The repository files and focused currency-related logic were statically
reviewed. New automated tests have been committed. The full Node test
suite and checks against the user's actual local SQLite database must run
on the owner's machine before merging PR #9.
