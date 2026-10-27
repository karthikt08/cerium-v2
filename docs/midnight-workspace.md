# Selective midnight card accents

Cerium's **workspace is light by default**. The sidebar, category/feature tabs,
white content panels, data tables, forms, dropdowns, record editors, dialogs,
Ask Cerium, and business setup are intentionally NOT a dark theme.

The dark navy / charcoal / plum palette requested by the founder is reserved
for **selected high-value cards**, using the existing workspace design and
blue-violet accents around them. The stylesheet
(public/css/workspace-midnight.css) loads after component styles to paint those
cards only, without changing layout, global colors, or native form controls.

The Overview header already has a separate targeted midnight treatment in
public/css/workspace-overview-unified.css; it is left unchanged.

## Highlighted cards

| Workspace | One deliberately emphasized surface | Nearby elements |
| --- | --- | --- |
| Overview | Outstanding amount KPI (third metric) | Other KPI cards, workflow panels and sidebar remain light |
| Field Service | Jobs today summary (first job stat) | Calendar, crew, dispatch, and other stats remain light |
| Customers & Sales / Quotes | Total estimates summary (first quote stat) | Estimate cards, forms, and other summary stats remain light |
| Billing / Reminders | Scheduled reminders summary (first stat) | Delivery controls, warnings, and lists remain light |
| Marketing / Performance | Booked-or-completed lead summary (first performance stat) | Marketing editor, review lists, other stats stay light |
| Insights | First business or sales report summary | Report tables, panels, other stat cards stay light |

No customer-record card, editable form, sensitive dialog, invoice paper,
or entire group gets a dark fill. All values continue to come from saved data.

## Card palette

- Navy: #202b55
- Charcoal: #151a27
- Deep ink: #10131a
- Highlighted card border: #46517c
- Primary text: #f6f7ff
- Secondary text: #d1dbee
- Small accents: pale lavender and blue

Each dark card's label, value, note, hover, and focus styles have explicit
readable colors. The stylesheet is **screen-only**, preserving printed invoices,
PDFs, and print reports. Reduced-motion behavior and normal workspace cursor
settings remain unchanged.

When adding a new dark-accent card, pick a *specific summary element* instead
of styling all panels, metrics, sidebar, or entire categories. Keep neighboring
surfaces light and add a regression assertion for text contrast and selector
scope. If a theme toggle is built later, that is a separate explicit feature,
not the meaning of "selected dark cards".
