# Workspace rebuild

The workspace frontend has been replaced with one layout and visual system. The landing page and existing authentication and API routes remain compatible.

## Interface

- Fixed navigation and header; the main workspace scrolls independently.
- Overview, leads, follow-ups, invoices, payments, reviews, settings, and support share consistent headings and actions.
- Lead list and board views, search and status filters, native form dialogs, invoice previews, loading and error states.
- Lavender and blue ambient background with the magnetic cursor. Touch and reduced-motion settings use the native pointer. Text entry retains the text cursor.
- A mobile navigation drawer, constrained table/board scrolling, visible focus, keyboard navigation, and native scrollbars styled to match the interface.

## Preview

Run `npm run preview:export` and open `output/cerium-preview.html` in a browser. The file is self-contained and uses a disposable sample workspace. Changes reset on reload. Billing, real account deletion, bank connections, and support messages are unavailable in the demo. The normal app continues to use the real API.

## Regression fixes

- Invoice identifiers use a persistent sequence so accounts and deletions cannot cause collisions.
- Existing invoice numbers are preserved during migration; the sequence survives restarts.
- Editing a lead already marked Done no longer creates another review request.
- Review editing is implemented; receiving a review does not fabricate a rating.
- New leads created on the same day appear first.
- Invoice due dates use the issue date and correctly honor Due on receipt.

## Verification

- Full Node test suite: 237 passing tests, including auth/security tests, workspace CRUD and ownership, CSRF/origin checks, filtering, validation, escaping, and file-backed migration checks.
- Secret scan and JavaScript syntax checks.
- Browser tests against an isolated Express/SQLite workspace: create/search/edit lead; complete/filter follow-up; create invoice; inspect invoice preview; mark paid and verify payment record; mark review received and filter it; inspect settings.
- At a 390 × 844 CSS-pixel viewport, the same UI in the disposable demo was checked for navigation, lead board containment, form validation, and saving a lead. Main content had no horizontal overflow (380px client width and 380px scroll width). The wide board scrolled within its own panel.

## Scope of validation

The browser checks use synthetic records. Live OAuth, paid checkout, actual bank integration, email delivery, printing through an operating-system printer, physical touch devices, and other browser engines were not exercised. Payment records explicitly disclose that this version has no live bank feed. Review requests are copied or logged; the interface does not claim to send them automatically.
