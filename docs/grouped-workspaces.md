# Grouped Cerium workspaces

The workspace now uses **category → feature tab → existing functional interface**. The current typography, action colors, dialogs, forms, records, API contracts and permission checks remain in place. No database migration or application dependency was added.

## Navigation

| Category | Feature tabs | Availability |
| --- | --- | --- |
| Overview | Daily dashboard | Always included |
| Customers & Sales | Leads; Follow-ups; Estimates & Quotes | Existing corresponding module selections |
| Field Service | Job Schedule; Dispatch; Crew Assignments | Jobs module |
| Billing & Payments | Invoices; Payments; Payment Reminders; Bank Matching | Corresponding modules; bank matching follows Payments |
| Marketing & Reputation | Get Found; Re-engage; Reviews; Performance | Marketing stays included; Reviews follows its module selection |
| Team & Resources | Crew; Assignments | Jobs module |
| Insights & Reports | Business Overview; Sales Insights; Revenue Insights | Business summary included; sales/revenue tabs follow relevant enabled tools |

Settings, Customize Tools, Help & Support and Ask Cerium remain accessible. The desktop sidebar collapse control and mobile drawer are preserved.

The shared registry is `public/js/workspace-registry.js`. Category destinations remember the last eligible tab during the current page session. Tabs use shareable hashes, support Back/Forward and switch without reloading the application. Arrow keys, Home and End navigate the tab strip; the active tab has a visible focus state and scrolls into view on narrow screens.

Examples of canonical links:

- `#customers/leads`, `#customers/followups`, `#customers/quotes`
- `#field/schedule`, `#field/dispatch`, `#field/crew-assignments`
- `#billing/invoices`, `#billing/payments`, `#billing/reminders`, `#billing/bank`
- `#marketing/visibility`, `#marketing/reengage`, `#marketing/reviews`, `#marketing/performance`
- `#team/crew`, `#team/assignments`
- `#insights/business`, `#insights/sales`, `#insights/revenue`
- `#settings/tools`

Existing bookmarks such as `#leads`, `#jobs`, `#quotes`, `#invoices`, `#payments`, `#reviews`, `#bank`, `#account` and Marketing subroutes continue working. Unknown routes safely fall back to Overview. Ask Cerium derives its trusted links and category labels from the same registry; model-provided URLs cannot create destinations.

## Existing capabilities, reorganized

Scheduling, job/crew editing, estimates, approvals, imports, invoices, country/tax rules, UPI, sharing drafts, reminders and review actions retain their existing implementations. Dispatch and assignment tabs provide views of existing scheduled jobs and open the existing job editor. Crew workload counts mean active recorded jobs, not actual availability.

Bank Matching is for existing recorded deposits and the existing equal-amount matching/dismissal actions. There is no live bank feed, partial-payment allocation or Undo match control. Payments still shows invoices marked Paid. A separate customer master, availability, attendance, timesheets and advanced dispatch are not presented as working features.

Reports summarize saved records. Booking share is the current proportion of leads marked Booked or Done, not a historical conversion rate. Invoice totals remain separated by currency; drafts are excluded from debt. Reports do not claim bank balances, profit, recognized revenue, ad attribution or marketing ROI. Data export uses the existing Settings workflow.

## Preferences and unsaved work

The existing module IDs and server-stored selections are unchanged. Each module appears once in Customize Tools, grouped under its primary category; Jobs also enables Team & Resources. Empty optional categories and unused tabs disappear. Hiding tools never deletes or changes records.

An explicit bookmark to a hidden tool remains usable and shows a notice with a Customize Tools link. This is a view preference, not a permission override. Subscription and server-side restrictions still apply.

Unsaved marketing, profile, support and reminder fields are retained in page memory while switching tabs/categories. Successful saves clear the relevant drafts. Open editors remain mounted during browser navigation, including the tool chooser. Drafts are not uploaded automatically or written to browser storage; they do not persist after closing or reloading the application. Last-used tabs also reset on reload.

## Adding a feature

1. Register its category, label, renderer/view, canonical hash and existing module requirement in `workspace-registry.js`.
2. Connect its implemented renderer/controller through the shared feature shell. Use internal controls/dialogs for deeper actions.
3. Reuse or explicitly extend module/permission rules; visibility alone must never grant access or delete data.
4. Add verified guidance to `guide-knowledge.js` when a new assistant topic is needed. Trusted destinations and Marketing tab registration derive from the registry.
5. Add route, visibility, keyboard/history, draft and real-browser workflow tests. Preserve legacy aliases when replacing a route.

## Verification

Run the existing suite with `npm test`. The additional regression suites are:

```sh
node scripts/qa-ui-audit.mjs
node scripts/qa-ui-workflows.mjs
node scripts/qa-workspace-navigation.mjs
node scripts/qa-business-setup.mjs
node scripts/check-secrets.js
```

Browser scripts require Playwright in the QA environment and Chromium. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed browser; `UI_AUDIT_OUTPUT` chooses the JSON/screenshot destination. They use isolated databases and synthetic accounts. Real OAuth, SMS, SMTP and payment-provider transactions are not executed. Chromium desktop/mobile emulation does not substitute for Safari/Firefox or physical-device testing.

Validation for this change: 718 Node tests; 19 browser navigation checks; 23 existing browser workflow checks; 147 public/workspace viewport inspections, with the final 95 workspace/entry inspections repeated after refinement; and all 12 existing onboarding checks. No unexpected overflow, unnamed inspected controls, missing local assets or uncaught browser errors were found in the layout sweep. Desktop/mobile screenshots, the offline preview build, JavaScript syntax and the secret scanner were also checked. Cross-platform GitHub CI is required before merge.
