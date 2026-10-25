# Country pricing and local invoices

CERIUM uses the business's confirmed operating country, never ethnicity,
nationality or a person's name, to select a subscription price. Every tier has
the same features. Phone possession and country attestation remain required;
phone verification is not proof of residency or registration.

| Country income group | Monthly subscription | Discount from USD 20 |
| --- | --- | --- |
| High income | USD 20 | 0% |
| Upper-middle income | USD 16 | 20% |
| Lower-middle income | USD 12 | 40% |
| Low income | USD 8 | 60% |
| India override | INR 500 | Local price, no FX comparison |
| Not classified | USD 20 | Standard fallback |

The source is the [World Bank FY2027 country classification](https://datahelpdesk.worldbank.org/knowledgebase/articles/906519-world-bank-country-and-lending-groups),
retrieved October 25, 2026. `public/js/country-income.js` pins 25 low-income,
47 lower-middle, 59 upper-middle and 87 high-income economies. Channel Islands
maps to both Guernsey and Jersey, producing 88 high-income phone-country codes.
All remaining supported phone territories have an explicit unclassified fallback.
The categories describe economies, not customers or eligibility for features.

Review the source annually, update the pinned version and tests, and review
territory mappings before release. There is no live classification fetch in
checkout and no automatic repricing of authorized subscriptions.

## Payment provider configuration

Configure separate Razorpay **monthly, interval 1** plans:

| Environment setting | Provider amount | Currency |
| --- | --- | --- |
| `RAZORPAY_PLAN_ID` | 2000 | USD |
| `RAZORPAY_UPPER_MIDDLE_PLAN_ID` | 1600 | USD |
| `RAZORPAY_LOWER_MIDDLE_PLAN_ID` | 1200 | USD |
| `RAZORPAY_LOW_PLAN_ID` | 800 | USD |
| `RAZORPAY_IN_PLAN_ID` | 50000 | INR |

Amounts are minor units. Credentials and webhook verification are also required.
Before creating a subscription, the server verifies the provider's interval,
amount and currency. A missing or wrong discounted plan returns a clear error;
CERIUM never substitutes the USD 20 plan. Browser-supplied country, amount,
currency and plan IDs do not control checkout. Provider/SMS availability still
applies. This code does not create provider plans or change live subscriptions.

Each subscription stores its authorized amount, currency, tier, source version
and plan ID. Migration backfills pre-tier mandates at their previous INR 500 or
USD 20 price. Settings discloses an existing mandate's actual price alongside
the new country offer. Cancellation and a new authorization are required to
change that mandate; already paid access is preserved. Existing cancellation,
trial timing, webhook verification and workspace gates are unchanged.

## Business currency and invoice structure

Business setup and Settings include a separate invoice/workspace currency.
India retains INR for its GST/UPI workflow; the US retains USD. Other countries
can select a currency supported by the runtime's ISO currency data, with local
hints for common markets (including Bulgaria's EUR adoption in 2026). The saved
currency applies consistently to leads, estimates, jobs, invoices and totals.
It does not alter CERIUM's USD subscription price. Existing workspaces retain
their currency. Switching currency is blocked once business money records exist;
there is no implicit exchange-rate conversion or relabeling. Subscription-only
history does not block an otherwise empty business workspace's currency choice.

Invoices now snapshot the supplier's name, contact details, address, country and
currency. Later profile edits do not change an issued invoice. Legacy invoices
retain their original amounts and currency; missing historical supplier details
cannot be reconstructed retroactively. Drafts can pick up corrected profiles.
All additions use non-destructive SQLite column migrations.

The editor supports supply date, supplier/customer tax registration IDs, up to
four explicitly entered tax components, tax/exemption/reverse-charge notes, and
payment instructions. Country presets provide US sales tax, UK/EU VAT,
Australia GST/ABN, Canada GST/HST, New Zealand/Singapore GST, and generic editable
tax labels elsewhere. India's existing GSTIN, HSN/SAC, place-of-supply,
CGST/SGST/UTGST/IGST and UPI calculations remain separate.

No tax is added by default. Each generic component applies independently to the
same subtotal; rates support up to four decimal places. Integer minor-unit
arithmetic rounds half-unit tax boundaries consistently, without floating-point
undercharges. Non-US tax charges need
an issuer tax registration ID. Registration IDs are not registry-verified.
Line-item rates retain the existing two-decimal input limit; totals and tax
amounts use the invoice currency's precision, including KWD's third decimal.
Whole-unit currencies reject fractional invoice subtotals. Printed money shows
the ISO currency code, full dates include the year, and print layouts use Letter
for US/Canada and A4 elsewhere. The mobile invoice table fits narrow screens.

These are business invoice templates, **not a universal tax-compliance or
e-invoicing integration**. The issuer must confirm registration, applicable rates,
required legal wording and numbering. Mixed rates by item, compounded taxes,
credit-note workflows, government clearance/IRN, statutory e-invoice submission
and tax filing require the business's local accounting workflow.

Structure references, reviewed October 25, 2026:

- [UK invoice contents](https://www.gov.uk/invoicing-and-taking-payment-from-customers/invoices-what-they-must-include)
- [EU VAT invoice contents](https://taxation-customs.ec.europa.eu/taxation/vat/vat-businesses/invoicing_en)
- [Australian invoice setup](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/record-keeping-for-business/setting-up-and-managing-records/setting-up-your-business-invoices)
- [Canada GST/HST invoice information](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/g300-6-3/invoices-gst-300-6-3.html)
- [Bulgaria's euro changeover](https://www.ecb.europa.eu/euro/changeover/bulgaria/html/index.en.html)

## Validation

Run `npm test`, `npm run check:secrets` and the offline preview export. Tests cover
all supported country prices, discounted plan validation, mandate migration and
snapshots, onboarding currency selection, invoice tax validation, local currency
totals, supplier snapshots and historical currency protection. Browser QA covers
country lookup and invoice creation/editing at 320, 390 and 1440px, the mandatory
business wizard, A4/Letter PDF output and offline module loading.
