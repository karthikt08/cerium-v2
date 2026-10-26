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

Overview and Marketing are always available and cannot be hidden through a
business tool selection. Ask Cerium is also available to guide navigation and
suggest existing modules; it is not a checkbox. Each of the eight selectable
modules now shows a short description in both mandatory business setup and
Settings → Customize tools. The chooser clearly distinguishes the shared hubs
from business-specific modules.

Overview cards reflow to fill each row as tools are enabled or disabled. A lone
card or the final card of an odd row fills the available width. Empty metric
and detail sections collapse completely. If no detailed panels apply, Overview
shows direct links to the selected tools. Missing preferences retain the full
Overview until account defaults are available.

## Smart suggestions

The "Suggest my tools" action in mandatory onboarding and Settings now uses
the same local business advisor (`public/js/business-tool-advisor.js`) as
Ask Cerium. It identifies established industries and described workflows,
such as scheduling, estimates, invoice sharing, overdue payments, customer
reviews and leads. Suggestions explain their fit and show only currently
implemented modules. The description is processed locally for tool selection;
it is not sent to a paid model or persisted by the advisor. The owner must
review and confirm the selection—recommendations never change settings by
themselves. This is a rule-based advisor, not a generative AI model.

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
