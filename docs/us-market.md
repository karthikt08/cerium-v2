# CERIUM — US contractor edition

## Target customers

CERIUM now focuses on US-based small contractors and local service businesses:
HVAC, plumbing, electrical, cleaning, landscaping, remodeling and similar teams.
The public copy, price labels, forms and business-day calculations use US
conventions. This is a product positioning change, **not an automatic legal or
geographic residency verification system**.

## US business setup

Open Settings → Business profile and fill in:

- City/service area (free text; existing values remain intact)
- US state (50 states, DC or Puerto Rico)
- ZIP (5 digits, optionally ZIP+4)
- **Business time zone** (ET, CT, MT, Arizona, PT, Alaska, Hawaii or Puerto Rico)
- US phone if desired

CERIUM preserves the time zone as an IANA identifier such as
\`America/Los_Angeles\`. The selected zone controls the business date for
new invoice issue/due dates, quote-derived draft invoices, follow-up defaults,
overdue invoice checks, and the daily dashboard. Appointment forms explicitly
say **business local time**; the existing stored \`YYYY-MM-DDTHH:mm\` values
remain unchanged rather than being automatically converted to/from UTC.
Before the business time zone is configured, existing browser/server-local
fallback behavior remains for compatibility.

**DST note:** Jobs are stored as local wall-clock times without a UTC offset.
During a US daylight-saving transition, a clock time such as 2:30 AM may not
exist, or a time such as 1:30 AM may occur twice. Confirm unusual overnight
appointments manually; precise DST-aware scheduling is a future enhancement.
For normal daytime local-service appointments, select the correct business zone.

## Currency and finance safety

- New US workspaces default to US/ **USD**, using familiar dollars and
  month/day date presentation.
- Editing a profile rejects non-US country or non-USD currency settings.
- \`CURRENCY\` environment configuration must be \`USD\`.
- **No amounts, historical invoices, paid records, or quotes are converted.**
  An existing account with a legacy non-USD currency is still displayed in its
  recorded currency, with a migration warning in Settings. Do not just relabel
  rupees as dollars. Review any legacy data before migration.
- CERIUM does **not** calculate sales tax. US contractor sales tax applicability
  depends on jurisdiction, service, materials and customer. Confirm with a
  qualified local tax adviser before charging customers; do not silently
  collect an arbitrary flat US sales tax.
- Marking an invoice Sent stores a status; it does not email it. Payment
  reminders still require explicit consent and SMTP setup.

## Payment processing and 15-day trial

The existing integration is **Razorpay**, which has not been replaced by this
US-market change. The server checks its subscription plan's currency,
amount and interval, but that does not prove the merchant account and every
US customer's payment method can complete recurring USD billing.

Before accepting paying customers, verify merchant eligibility, USD recurring
support, settlement, refunds, cancellation, live card authorization and the
15-day consent-driven trial using approved provider sandbox/live procedures.

Relevant provider information:
- https://razorpay.com/accept-international-payments/
- https://razorpay.com/us/pricing/

A US-oriented processor (for example Stripe) may be worth evaluating later,
but changing processor now would alter webhook, subscription and reconciliation
code and require a separate tested implementation.

## Legal and launch review

This change **does not edit Terms of Service or Privacy Policy**. Those are
legal documents and should not be silently rewritten simply because the
product's customers are in the US. The existing Terms mention Indian governing
law and need deliberate legal review for the planned US customer base. Review
US state privacy requirements, trial/automatic-renewal disclosures, email
consent, cancellation practices, and any required address/registered business
disclosures before commercial launch.

## Quick smoke test

1. Run \`npm test\` locally.
2. Log in as a test business, go to Settings, select **CA**,
   ZIP \`94105\`, and **Pacific (PT)**. Save and refresh.
3. Create a quote for a US service address, approve it in an incognito window,
   convert it to a job, and complete it.
4. Confirm the invoice retains its exact dollar total and follows the
   business date. Confirm no email or charge was sent automatically.
5. Try invalid ZIP / unsupported time zone / \`INR\` API updates:
   they should be rejected with a 400 error.

No Supabase/Firebase/paid geographic APIs are necessary.
