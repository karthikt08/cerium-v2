# CERIUM interface direction

The interface should read as a small-business work tool: readable records, clear actions, and a consistent hierarchy across the public site, account pages and workspace.

- Use warm white backgrounds, white work surfaces, fine neutral borders and a restrained blue for actions and current selection.
- Keep Figtree, the separate logo + full CERIUM wordmark, the brand blinker and the existing cursor behavior. Respect reduced-motion preferences.
- Prefer task-specific headings and factual explanations. Avoid unsupported customer quotations, popularity labels, vague motivational UI copy and decorative success claims. Save status belongs to the actual request state, not static page copy.
- Use a compact summary strip for dashboard totals. On phones, show two readable columns. Hidden workspace modules must not reserve empty slots.
- Keep empty states short and aligned with the records around them. Do not turn a missing record into a large promotional card.
- Keep links visibly underlined and form controls clearly bounded. Preserve native dropdown padding, focus rings, validation messages and disabled states.

`public/css/cerium-ui.css` is the shared screen presentation layer. Load it after page styles and before `typography.css`, which remains the final typeface authority. Its screen media query deliberately leaves invoice/quote print styling independent. Existing layout and animation files continue to own behavior and structure.

Validation performed for this change:

- Full Node suite: 549 passing tests.
- `scripts/qa-interface.mjs`: 129 browser checks at 320, 390, 768 and 1440 pixels, including public pages, signed-in views, invoice dialogs, mobile navigation, interactive landing example and customized Overview reflow. No page errors.
- `scripts/qa-business-setup.mjs`: existing phone/business setup, India GST validation, drafts, stale reviews, retries and offline preview checks passed.
- Desktop and mobile screenshots reviewed for the landing page, Overview, invoices, login, pricing and business setup.

Both browser scripts accept `PLAYWRIGHT_CHROMIUM_EXECUTABLE` and an installed Playwright package (or `CODEX_PRIMARY_RUNTIME_NODE_MODULES`). They create disposable local accounts and databases. Interface QA deliberately blocks the external font request to also exercise the system-font fallback; production retains the Figtree stylesheet.
