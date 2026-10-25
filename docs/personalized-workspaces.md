# CERIUM personalized workspaces (v1)

CERIUM provides ten recommended business workspace profiles:

1. Construction & renovation
2. Plumbing
3. Electrical services
4. HVAC & refrigeration
5. Cleaning & maintenance
6. Landscaping & gardening
7. Roofing
8. Painting & finishing
9. Handyman & home repair
10. Consulting & freelance

**Other — choose my tools** lets a business owner select any combination of
the existing CERIUM tools. Choosing a profile merely establishes defaults; the
owner may enable or disable any listed module during business onboarding and
later in Settings > Customize your workspace.

## Smart suggestions

The "Suggest my tools" control recognizes common task words in descriptions,
for example scheduling, estimates, overdue invoices, reviews and leads.
It uses deterministic local rules in `public/js/industry-workspaces.js`, **not
a language model**. The description is read only in the current browser and is
not submitted to an AI provider or persisted by the recommender. Suggestions
are explainable and fully editable. Never label these rules as a trained AI
model in customer-facing copy.

## Data and security

- Existing rows are migrated additively with `users.industry_category`
  and `users.workspace_modules`. Empty preferences inherit defaults using
  the customer's existing `trade` field; no forced new onboarding is triggered.
- Owner preferences live in SQLite as an allowlisted category and a JSON array
  of eight known module IDs. The update API has authenticated session, CSRF,
  same-origin, field validation and rate limiting.
- Hidden modules do **not** revoke API permissions, delete historical data, or
  block direct links. This is only an owner-facing layout preference.
- Business verification, country/currency, billing authorization, trial start
  and recurring payment rules are unchanged.
- Changing industry does not alter invoice currency or stored job data.
- Multi-user employee roles, technician permissions, new specialized workflows,
  and external LLM recommendations are **not** included in v1.

## Follow-on validation

Interview owners from these industries before building specialized modules.
Measure whether customers enable the suggested defaults, disable modules,
use more of their workspace, and return after the initial week. Add paid AI only
after clear value, consent, cost and data-handling review.
