# Cerium UI consistency contract (October 2026)

Cerium is a **product-led business operations tool**, not a set of disconnected marketing and setup templates. The reference visual language is the in-app workspace: **Figtree**, blue primary actions, neutral surfaces and borders, 8–10 px control corners, clear focus states and quiet motion. The public landing page may retain its expressive **purple spatial glow, floating title bar and magnetic cursor**; those are background/interaction accents, not a reason to change button geometry.

## Source of truth

- **`public/css/workspace.css`**: workspace layout, tables, navigation, primary UI components and layout tokens.
- **`public/css/ui-consistency.css`**: cross-page button geometry, forms, native dialogs, popup treatment, onboarding/welcome alignment and safe responsive/accessible behavior. Include immediately before `css/typography.css` on every customer-facing HTML page.
- **`public/css/typography.css`**: final font cascade; Figtree for all copy, labels, input controls, browser popups where styleable and dialogs. The entry-brand animation alone uses its artwork font.
- **`public/css/controls.css`**: accessible links and native/select picker styling. It preserves native selects and reserves an arrow lane on either text direction.
- **`public/css/spatial.css`, `public/css/home.css`, `public/css/pricing-motion.css`**: public landing motion and visual treatments. These do not override workspace form and modal architecture.

## UI design rules

1. Use `button.button.primary`, `button.button.secondary`, and `button.button.danger` in workspace modules, including in dynamically generated dialogs. Use `.btn` and `.btn.gh` on public pages.
2. For close icons use `.icon-button` or the existing module-specific close class with an accessible `aria-label`. **Do not** give icon-only buttons full text-button padding or change compact table-action sizing.
3. Use native `<dialog>` where focus trapping and escape-to-close are required; preserve `::backdrop`, accessible headings, keyboard focus, scroll and mobile sizing. All dialog shells share the design layer, but invoice print content stays isolated.
4. Keep primary actions blue; neutral secondary actions and red destructive actions remain semantically distinct. The AI guide can retain a purple accent without introducing completely different button shapes.
5. Use 9 px controls, ~17 px dialog shells, 38–42 px regular click targets, and maintain the separate 29 px table controls. Do not force layout fixes with broad `!important` resets.
6. Keep `typography.css` **last**, and do not introduce hard-coded `system-ui` text stacks into new modal forms, business onboarding or dropdown popups.
7. Support keyboard focus, disabled/read-only field presentation, small screens, `prefers-reduced-motion` and print output. Native menu/combobox APIs and the cursor script must remain functional.
8. Reuse the existing page-specific class/structure rather than layering new lookalike wrappers or adding a second cursor/animation engine.

## Regression coverage and visual review

Run `npm test`. `test/ui-consistency.test.js` protects stylesheet coverage, modal families, popup and field treatment, the font contract, and preservation of spatial visuals. Existing onboarding, select, typography, business setup, cursor and navigation suites protect behavior.

**Manual device QA still matters.** Review desktop and mobile sizes, mouse and touch, keyboard-only tab order and escape-key modal behavior. Check workspace record/confirm/invoice dialogs; jobs/crew and quotes/approval popups; Excel/CSV import; workspace customizer; AI guide; all onboarding steps; pricing tabs/cards; legal/auth pages. Compare actual rendered output before declaring pixel-perfect parity; static CSS assertions are not visual snapshots.
