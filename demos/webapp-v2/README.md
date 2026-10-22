# Cerium — refined local demo

This is the uploaded **Webapp V2** design, repaired and refined. It retains the glass cards, gradient background, launchpad, magnetic cursor, trailing spotlight and card depth effects.

## Open it

- **Quick preview:** open `preview.html` in a browser. It includes the workspace's CSS, JavaScript and images in one file.
- **Full package:** extract the ZIP and open `app.html` (or `index.html` for the landing page).
- **Local server:** with Node.js installed, run `npm start`, then open `http://localhost:8080/app.html`. No package installation is required.
- **Regression checks:** run `npm test`.

The workspace opens to the launchpad; the single-file preview starts at the dashboard. Use Launchpad under Workspace (or in the mobile header) to return to the welcome screen. Navigation is reflected in the URL and survives reloads.

## What changed

- Rebuilt the launchpad with glass surfaces, a clear workspace action, live daily stats and quick lead/invoice entry.
- Replaced black action buttons with lavender/blue gradients, tinted secondary controls and clear filter states.
- Removed the Launchpad button beside the logo and shortened Daily Operations navigation to **Overview**.

- A quieter desktop header, readable dashboard cards, persistent navigation, a visible scrollbar, and responsive mobile navigation.
- Horizontal scrolling stays inside tables and the pipeline board. Forms remain scrollable on narrow screens.
- The reference's trailing cursor spotlight is restored. Magnetic controls and card lift/tilt remain; animation stops when idle and is disabled for touch or reduced motion.
- Saves report errors, preserve failed form values and prevent duplicate submissions. Closing a new form keeps its draft during the current page session. Reloading with unsaved drafts prompts before leaving.
- Profile drafts are preserved during unrelated updates. Record menus support keyboard navigation and focus return.
- Dates, amounts, email addresses and links are validated. Record IDs stay unique after deletion. Partial edits retain untouched fields.
- Bank matches check the invoice, amount and transaction state. Partial payments leave a remaining balance. Undo match restores the balance. Deleting an invoice removes stale match references.
- Invoice edits preserve recorded payments and original line-item detail. Mobile invoice tables scroll independently while the close and print controls stay accessible.
- All follow-up types, including site visits, save correctly. Message drafts can be saved locally, and loading a saved message protects an unsaved draft.
- Review tracking no longer invents five-star reviews or claims to send messages. Copy a request, send it in your own messaging app, then log that you asked.
- Broken sign-in, password-reset and waitlist forms now lead to the local demo. This package does not include those server endpoints.
- The static server handles malformed requests, path traversal, unsupported methods, and missing files safely.

## Data and demo boundaries

This is a **local demonstration**, not a production service. Banking and subscription controls simulate state changes. No real bank, authentication server, payment provider or email delivery service is connected. The initial business, customers and reviews are sample data.

Saved records live in this browser's local storage. The preview uses a separate store from the full workspace. Use Account & Data to export JSON before clearing browser data or resetting the demo. Currency changes require clearing existing invoices/deposits first; amounts are never silently relabeled or converted.

If storage is full or blocked, Cerium reports the failure instead of pretending to save. If stored data is malformed, the recovery screen lets you download the original data before resetting it. File-based storage varies by browser; use the local server if needed.

The full app and preview work without JavaScript libraries or an API server. Optional Google Fonts need internet; system fonts are used otherwise.

## Verification

See `QA.md` for the regression scope and browser checks. No real messages or payments were sent.
