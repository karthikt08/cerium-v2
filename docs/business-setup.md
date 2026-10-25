# Required business setup

Production onboarding is **phone verification → business details → recurring
payment authorization → workspace**. Business setup is a required wizard:
**Business basics → Address → GST (India) → Review and confirm**. The server enforces every step on the
workspace shell and APIs. Posting directly to checkout cannot skip business
setup. The application still supports all 245 country/territory entries in its
phone catalog. India remains INR ₹500/month; all other countries remain USD
$20/month.

## Required information

| Applies to | Required fields |
| --- | --- |
| Every business | Contact name, business/trading name, business contact email, industry/main service, street address, city/locality, business time zone, confirmation that the details are accurate and the user can manage the business |
| United States | US state and ZIP code; a supported US business time zone |
| India | State/union territory, six-digit PIN code and a registered/not-registered GST declaration; time zone is Asia/Kolkata |
| GST-registered Indian businesses | GSTIN in the existing supported format, matching the selected state |
| Other countries | State/region and postal code are optional; any supported IANA business time zone |

Independent operators can use their own name as the business name. Country and
currency come from the existing verified phone and country declaration, never
from submitted pricing fields. These are self-declared business details, not
an independent registry, tax-registration or business-email verification.
No new identity-document or banking-document collection is introduced.

The server trims and validates all required fields, rejects non-text and
overlong values, and saves the complete profile atomically. India GSTIN is
required only when the user declares GST registration. The wizard shows one step at a time. Each Continue validates and saves that
step. The server rejects attempts to skip ahead; saving drafts never unlocks
the workspace. Final confirmation validates the entire saved profile. Closing
the tab, signing in again or restarting the server resumes the saved step.
Field errors preserve entered values, and Back allows corrections.

## Existing accounts and editing

Existing accounts missing setup are directed to the business form after their
existing phone verification is recognized. An already authorized mandate does
not need to be authorized again. Existing paid and started-trial dates remain
unchanged. Export, cancellation and sign-out remain available while setup is
incomplete; the authenticated account-deletion endpoint remains available too.

Settings links to `/verify.html?edit=business`. A later save preserves the
original setup-completion timestamp and does not restart the trial. The older
Settings profile form cannot erase fields required by a completed setup.
Business contact email and address appear on invoice previews. Previously
saved invoice currency, amounts and GST snapshots are retained; supplier
contact information continues to reflect the current business profile.

For a first production authorization, a callback or signed webhook received
without completed business setup cannot start the trial; the unsafe pending
subscription is cancelled through the existing provider cancellation path.
Previously authorized subscriptions continue to process billing events.

## Storage and deployment

The business-profile migration added seven columns to `users`: `business_email`, `business_address`,
`business_city`, `business_region`, `business_postal_code`, `gst_registration`
and `business_profile_completed_at`. This wizard adds `business_setup_draft`,
a JSON draft containing the saved step and its owner-provided details. A draft
is never a completion receipt. Existing name, trade, state, GSTIN and
time-zone fields are reused. The migration is additive and repeatable; no
existing account is silently marked complete or repriced. Follow the normal
database-backup process before deployment.

- `GET /api/business/profile` returns only the current user's profile and status.
- `POST /api/business/profile` requires session, same origin, CSRF, verified
  phone, all applicable fields and `confirmBusinessDetails=true`.
- `GET /api/business/setup` reads the owner’s saved step and draft.
- `POST /api/business/setup` saves only the permitted fields of the current or
  an earlier step. Editing an earlier step rewinds progress for revalidation.
- `POST /api/business/setup/complete` requires every step and explicit confirmation.
- `GET /api/billing/identity` includes `businessComplete` and `businessProfile`.
- Account export includes the business profile; account deletion removes it.
- No new dependencies or environment variables are required.

Production requires `WORKSPACE_ACCESS_MODE=phone_and_mandate`. Local `phone`
mode unlocks only after phone and business completion. `off` is accepted only with
`NODE_ENV=test` for automated fixtures. Normal local runs cannot disable the
setup gate. Replace a previous local `WORKSPACE_ACCESS_MODE=off` with `phone`
and restart the server. Loopback simulated SMS uses code `000000`.

## Validation

The PR records final automated and browser check results. Tests cover both the
connected app and the generated offline preview. Provider tests use fixtures.

The regression suite covers missing and malformed data, owner isolation,
country/pricing spoofing, CSRF, phone prerequisites, workspace and checkout
gates, first-authorization callbacks and webhooks, GST requirements, edits,
exports, sign-out, deletion and preservation of existing billing dates. A
legacy-database fixture verifies additive migration and repeated reopening,
preserved invoices/subscriptions, database integrity and foreign keys.

Chromium workflows exercise US, India, Canada, UK, France and Nepal at
1440×1000 and 390×844: all setup steps, native required-field checks, reloads,
country-specific fields, registered/unregistered India flows, payment
authorization, profile editing and invoice previews. The offline export also requires empty-business setup before displaying
navigation. It saves setup progress in browser storage and uses shared validation;
completed details can be edited from Settings. This is a local preview, not a
replacement for server authentication, SMS or payment authorization. Provider responses are test fixtures; no live SMS or
payment was sent. Other browser engines and real mobile devices were not
covered.
