# Midnight workspace

The workspace uses the navy, charcoal, lavender, and soft plum palette from the
Overview header. `public/css/workspace-midnight.css` is the final screen-only
paint layer, after the existing component and blue-action styles and before
typography. It changes colors without changing layout, navigation, data, or
business workflows.

| Role | Color |
| --- | --- |
| Canvas | `#10131a` |
| Work surface | `#171f2f` |
| Input | `#111a2a` |
| Dividers | `#394761` |
| Control outlines | `#647494` |
| Primary text | `#f4f5ff` |
| Supporting text | `#b3bfd6` |
| Lavender accent | `#c1b8ff` |
| Primary action | `#315cca` |
| Keyboard focus | `#b5c4ff` |

The theme covers every workspace category, Settings, support, native form
controls and dropdown menus, imports, record and confirmation dialogs, tool
customization, and Ask Cerium. The offline preview's business setup also inherits
the theme. The normal public marketing/authentication/onboarding pages do not
load this stylesheet.

Invoice paper stays light inside the dark preview chrome. The theme is limited
to screen media, so print/PDF styles and QR readability remain independent.
Error and warning states retain explicit text and distinct warm accents. Native
dark controls, visible cursor/focus states, and forced-color behavior are kept.

When adding a component, use the `--night-*` surface and text tokens and check
its hover, focus, disabled, empty, validation, and open-dialog states. Existing
component rules can have higher specificity; verify computed styles rather than
assuming a new color rule wins.

Validation for this change: 733 Node tests, 42 existing browser workflow and
navigation checks, 140 populated page/editor inspections at 1440, 1024, 768, 390,
and 320px, and the business-setup/offline-preview checks. Browser inspection
included imports, customizer, assistant answers, native selects, confirmations,
invoice preview/print media, and 15 record-editor views. Text-contrast screening
and checks for stray light UI surfaces found no remaining flags in those views.
This is Chromium coverage, not a claim of complete accessibility certification
or physical-device/cross-browser testing.
