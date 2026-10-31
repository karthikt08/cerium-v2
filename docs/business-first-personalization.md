# Business-first workspace personalization

Cerium uses the **saved business type** as the workspace identity, not as one more tab in a generic screen.

## Automatically follows the selected business

Business type is selected in required setup and can be changed in **Settings → Customize Tools**. A preview explains how the workspace will look before saving. The stored business category personalizes the sidebar labels, feature tabs, breadcrumb titles, Overview dashboard, work shortcuts and service forms.

All ten official categories have appropriate navigation terminology: construction, plumbing, electrical, HVAC, cleaning, landscaping, roofing, painting, handyman, and consulting.

## Deep operating centers

| Business | Field Service feature | Views |
| --- | --- | --- |
| HVAC | Equipment & Maintenance | HVAC Desk, Equipment Register, Maintenance Due, Service History, Return Visits |
| Cleaning | Properties & Quality | Cleaning Desk, Client Properties, Quality Checks, Service Plans, Repeat Visits |
| Landscaping | Property Care | Landscape Desk, Property Register, Irrigation Work, Seasonal Care, Return Visits |

These use actual customer jobs and service reports. Equipment is grouped by customer and saved serial/model; properties are grouped by client and recorded address. Quality check progress, completed report history, irrigation records and revisit dates reflect saved records, never fabricated metrics.

Each operating center offers service-type presets that open the real job editor. The Trade → Service record editor restricts new workflow choices to the selected business while preserving old saved cross-business reports.

A new saved and validated service cadence (One-time, Weekly, Every 2 weeks, Monthly, Quarterly, Every 6 months, Annually, Custom) supports repeat-service tracking. It is **not** an automatic scheduling, payroll or contract-billing system.

## Safety and scope

- Shared invoices, quotes, payments, marketing, CRM, crew and jobs retain their original functionality and module preferences.
- All existing jobs, including jobs from other industries, remain stored when the business type changes.
- Existing deep links remain known; irrelevant industry tabs are no longer displayed.
- Existing CSRF, server write access, subscription restrictions, validation and user-owned records remain intact.
- The other seven industries have a business-named UI and operational overview based on existing records. They do **not yet** have deep industry-specific backend models.
- Registers are projections of saved service jobs, **not** independent asset/property master tables. Repeat cadences and recommended dates **do not** automatically schedule service.
- Checklists are business-entered notes, not compliance certificates.

## How to use

1. Update to the latest main branch and open the workspace.
2. In Settings → Customize Tools, select HVAC & refrigeration, Cleaning & maintenance or Landscaping & gardening. Save.
3. Visit Overview for the business-specific snapshot.
4. Open Field Service (now renamed for your business) → its business operations feature.
5. Create a service visit, fill its business-specific report, and see it in the corresponding register/queue.

Validation commands: npm test; node scripts/qa-workspace-navigation.mjs; node scripts/qa-workspace-capabilities.mjs.
