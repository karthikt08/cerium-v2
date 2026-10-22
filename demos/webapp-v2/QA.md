# Verification — uploaded V2 refinement

## Automated checks

`npm test`: **49 tests passing** across:

- Lead/reminder creation, linked records, unique IDs after deletion, partial edits, review queuing and invalid input.
- Storage quota failure, corrupt JSON recovery, damaged records, persistence after clearing and fresh reads across two API instances.
- 100 concurrent lead creations with no missing records or reused IDs.
- Invoice cents, quantities, issue/due dates, payment terms, multi-item preservation, paid/reopened state and remaining balances.
- Exact and partial deposit matching, overpayment prevention, duplicate processing, missing invoices, stale references and undo.
- Every follow-up channel offered by the form, including On-Site Visit.
- Editing paid invoice totals without inventing payments; preserving detailed single-line quantities during ordinary edits; decimal half-cent rounding.
- Generated invoice HTML preserves totals, payments and balance, escapes customer text, and releases superseded download URLs.
- Review tracking without invented ratings, URL validation, profile preservation and safe currency changes.
- Static assets, unique markup IDs, classic-script syntax and demo entry pages.
- GET/HEAD behavior, malformed URLs, traversal, private source routes, MIME types, unsupported methods and 404s.

## Browser checks

Verified in the cloud Chrome browser using the actual app:

- Launchpad → dashboard, sidebar navigation, deep links and reload persistence.
- New-lead form focus, draft preservation after closing/reopening, and double-click submission creating one record.
- Lead search, stage changes, pipeline/list switching and source filters including legacy source values.
- Record menu keyboard navigation and Escape focus return.
- Inline validation retaining invoice fields, invoice creation and due-on-receipt dates.
- Invoice preview shows item totals, payments and remaining balance.
- Confirming a sample deposit and undoing it restores the correct invoice balance.
- Unsaved account fields survive toggling another setting; saving reports completion.
- Responsive layouts at 390px and 320px, regional table/board scrolling, and a scrollable mobile form.
- Card motion, magnetic cursor and trailing ambient spotlight are present in the preview.
- On-Site Visit saves successfully and appears in the follow-up list.
- Loading a saved message preserves an existing unsaved draft. Double-clicking Save draft creates one local copy; no email is sent.
- Editing a paid test invoice from $3,000 to $3,500 keeps $3,000 paid and shows $500 due.
- The invoice preview fits a 320px viewport: the dialog has no horizontal overflow, print/close controls stay inside it, and its line-item table scrolls independently.
- Runtime logs checked for application errors; extension-generated metadata warnings are unrelated to Cerium.

## Launchpad and theme update (2.2.0)

- All 49 automated regression tests pass after the redesign.
- Desktop: launchpad, note cycling, invoice quick action, Overview navigation and return to Launchpad verified in Chrome.
- At 320px and 390px: the launchpad has no horizontal page overflow; native metric buttons remain keyboard accessible.
- The invoice quick action opens the invoice view and form. At 320px, its dialog has clientWidth/scrollWidth 272px and scrolls vertically for all fields.
- Keyboard Enter on the bank-matching launchpad card opens Bank Match with focused page heading.
- The logo row has no Launchpad button. The sidebar label is Overview; the return link is in Workspace navigation.
- Primary buttons, secondary buttons, filters, selected navigation and close controls use the theme palette. No visible Overview button retains the old black fill.
- Cursor ring and glow, card tilt/shadows, touch safeguards and reduced-motion rules remain in place.

## Limits

These checks exercise a local demo, not a production backend. Responsive checks use real narrow browser frames, not physical iOS/Android devices. The generated invoice HTML is tested for content and escaping, and its link is clickable, but the cloud browser did not expose a completed file-download event; browser download capture and OS print/PDF dialogs were not verified. Review/email delivery, real bank connections, live billing and authentication are outside this package.
