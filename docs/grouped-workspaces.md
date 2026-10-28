# Grouped Cerium workspaces

The workspace now uses **sidebar category → feature tab → subfeature row → functional interface**. The current typography, action colors, dialogs, forms, records, API contracts and permission checks remain in place. New operations, migration metadata and customer payment tables use additive SQLite migrations. No application dependency was added.

## Navigation

| Category | Feature tabs | Availability |
| --- | --- | --- |
| Overview | Daily dashboard | Always included |
| Customers & Sales | Leads; Follow-ups; Estimates & Quotes | Existing corresponding module selections |
| Field Service | Job Schedule; Dispatch; Crew Assignments; Dispatch Planning | Jobs module |
| Billing & Payments | Invoices; Payments; Payment Reminders; Custom Dues; Bank Matching; Expenses | Corresponding modules; bank matching follows Payments |
| Marketing & Reputation | Get Found; Re-engage; Reviews; Performance | Marketing stays included; Reviews follows its module selection |
| Team & Resources | Crew; Assignments; Availability; Attendance; Timesheets; Inventory | Jobs module |
| Insights & Reports | Business Overview; Sales Insights; Revenue Insights | Business summary included; sales/revenue tabs follow relevant enabled tools |

| Settings & Customization | Business Settings; Customize Tools; Data Management; Account & Subscription; Spreadsheet Migration | Always included |
| Ask Cerium | Feature Discovery; Workflow Guidance; Response Experience | Always included |
| Help & Support | Product Help; Support Requests | Always included |

Each of the 10 categories appears once in the sidebar. The desktop sidebar collapse control and mobile drawer are preserved.

The shared registry is `public/js/workspace-registry.js`. Category destinations remember the last eligible tab during the current page session. Tabs use shareable hashes, support Back/Forward and switch without reloading the application. Arrow keys, Home and End navigate either row; the active tab has a visible focus state and scrolls into view on narrow screens.

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

Scheduling, job/crew editing, estimates, approvals, imports, invoices, country/tax rules, UPI, sharing drafts, reminders and review actions retain their existing implementations. Job Schedule opens the weekly calendar with a matching page heading. Dispatch and assignment tabs provide views of existing scheduled jobs and open the existing job editor. Crew workload counts mean active recorded jobs, not actual availability.

Bank Matching retains the equal-amount matching/dismissal workflow for recorded deposits. Payments adds a separate verified-receipt ledger for partial and split allocations, with manual reversal reasons. No live bank feed or Undo bank match control is advertised. There is no separate customer master; customer details remain attached to leads, estimates, jobs and invoices.

Availability records actual working windows and absences. Dispatch Planning checks those windows and existing job conflicts, distinguishes unconfigured crew, and saves an assignment only after confirmation. Availability edits cannot invalidate active assignments. Attendance shows open shifts; Timesheets records business-local shifts and breaks. Hours use the difference between recorded local clock times, not a payroll or timezone-offset calculation. Inventory provides editable stock records; Expenses stores actual user-entered costs without fabricating profit.

Spreadsheet Migration supports CSV/XLSX leads, jobs, historical invoices, expenses and inventory. Preview is side-effect free; commit validates atomically. Sheet/header selection, arbitrary column mapping, saved mappings, preserved custom fields and duplicate detection are implemented. Distinct external references preserve legitimate repeated jobs/invoices/expenses. See [universal migration](universal-migration.md) and [payment ledger](customer-payment-ledger.md).

Reminder Templates are saved records and are snapshotted only when explicitly selected for an approved reminder. Opt-outs and delivery controls remain required. The separate manual draft editor never schedules or sends a message.

The Invoices and Payments tables format each invoice in its saved currency, falling back to the business currency only for records without one. Payments totals group paid invoices by currency, using the same recorded-data summary as Revenue Insights. Partial allocations contribute to recorded payments and reduce outstanding balances. Fully paid invoices are counted once. Unallocated receipts remain in the ledger and are excluded from invoice-based summaries. Viewing these groups does not update invoice records, tax calculations or payment status.

Reports summarize saved records. Booking share is the current proportion of leads marked Booked or Done, not a historical conversion rate. Invoice totals remain separated by currency; drafts are excluded from debt. Reports do not claim bank balances, profit, recognized revenue, ad attribution or marketing ROI. Data export uses the existing Settings workflow.

## Preferences and unsaved work

The existing module IDs and server-stored selections are unchanged. Each module appears once in Customize Tools, grouped under its primary category; Jobs also enables Team & Resources. Empty optional categories and unused tabs disappear. Hiding tools never deletes or changes records.

An explicit bookmark to a hidden tool remains usable and shows a notice with a Customize Tools link. This is a view preference, not a permission override. Subscription and server-side restrictions still apply.

Unsaved marketing, profile, support and reminder fields are retained in page memory while switching tabs/categories. Successful saves clear the relevant drafts. Open editors remain mounted during browser navigation, including the tool chooser. Drafts are not uploaded automatically or written to browser storage; they do not persist after closing or reloading the application. Last-used tabs also reset on reload.

## Adding a feature

1. Register its category, label, renderer/view, canonical hash and existing module requirement in `workspace-registry.js`.
2. Add its subfeature definitions and recorded-data projections to `workspace-subviews.js`; connect the renderer/controller through the shared shell. Use existing editors for record actions.
3. Reuse or explicitly extend module/permission rules; visibility alone must never grant access or delete data.
4. Add verified guidance to `guide-knowledge.js` when a new assistant topic is needed. Trusted destinations and Marketing tab registration derive from the registry.
5. Add route, visibility, keyboard/history, draft and real-browser workflow tests. Preserve legacy aliases when replacing a route.

## Verification

Run the existing suite with `npm test`. The additional regression suites are:

```sh
node scripts/qa-ui-audit.mjs
node scripts/qa-ui-workflows.mjs
node scripts/qa-workspace-navigation.mjs
node scripts/qa-workspace-capabilities.mjs
node scripts/qa-business-setup.mjs
node scripts/check-secrets.js
```

Browser scripts require Playwright in the QA environment and Chromium. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed browser; `UI_AUDIT_OUTPUT` chooses the JSON/screenshot destination. They use isolated databases and synthetic accounts. Real OAuth, SMS, SMTP and payment-provider transactions are not executed. Chromium desktop/mobile emulation does not substitute for Safari/Firefox or physical-device testing.

The navigation browser suite covers all 10 categories and 24 regression scenarios. The capabilities suite walks all 88 subviews without changing records, then exercises filtering, history, availability and assignment, timesheet draft identity, saved templates, migration, payment allocation/reversal, assistant activation, mobile keyboard navigation and expired-plan controls. Screenshots and structured results are written to `UI_AUDIT_OUTPUT`. Run cross-platform CI on the final stack branch before any merge.

The offline HTML export remains a disposable demonstration. Server-backed operations, migration and payment allocations explicitly require the connected app; the demo does not pretend to persist or validate those server records.
