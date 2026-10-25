# Worldwide phone verification and pricing — 25 October 2026

National-format phone numbers are now accepted using the selected business
country. A US customer can enter `4155550123`, `(415) 555-0123`,
`1 415 555 0123`, or `+1 415 555 0123`; all become `+14155550123`.

| Business country | Monthly subscription | Provider plan |
| --- | --- | --- |
| India | INR ₹500 / 50000 paise | `RAZORPAY_IN_PLAN_ID` |
| Every other country | USD $20 / 2000 cents | `RAZORPAY_PLAN_ID` |

The first production trial still requires verified phone possession and a
provider-confirmed recurring mandate. The 15-day trial protections remain.
Prices, currencies and provider plan identifiers are selected by the backend;
submitted browser amounts and currencies cannot override them. `PRICE_CENTS`
must be 2000 if supplied. A mismatched provider plan fails closed.

## Phone and country behavior

- The selector includes all **245 country/territory entries** in the pinned
  `libphonenumber-js` 1.13.15 metadata. Full metadata validates national and
  international formats. Extensions, invalid numbers and calling-code
  mismatches are rejected before SMS is requested.
- Shared calling plans, including +1 and +44, retain the customer's explicit
  business-country declaration. A Canadian account stays Canadian; +1 alone
  never means US. A phone verifies possession, not residency or registration.
- Canonical E.164 storage keeps duplicate-phone checks effective across local
  and international input formats, including countries sharing a calling code.
- OTP rate limits, CSRF, ownership, billing-country locks and signed payment
  verification remain enforced. Existing confirmed receipts are retained;
  a phone metadata update does not revoke an already verified number.
- Reloading an outstanding verification preserves its pending country.
- Signup, geolocation pricing, workspace write permissions, checkout and
  settings accept international countries. India keeps GST/UPI fields. Other
  countries use USD; only US accounts get US state/ZIP-specific fields or US
  phone formatting. International accounts can select their business time zone.
- Scheduling supports quarter-hour offsets such as Nepal. Valid saved time-zone
  aliases remain selectable across differing browser/Node ICU versions.

No new database migration is introduced by this change. Existing financial
history and subscriptions are not converted or repriced when an owner travels.
Country changes on established accounts still require review.

## Provider setup

Application country coverage does **not** guarantee worldwide SMS or payment
delivery. Twilio Verify geographic permissions, destination delivery support
and Razorpay merchant/card eligibility remain in effect. Unavailable providers
do not unlock the workspace or fake a successful payment.

1. Install locked dependencies with `npm ci` after updating the code.
2. Keep the INR 500 monthly plan and USD 20 monthly plan configured separately.
   Enable international card subscriptions for the USD plan with Razorpay.
3. Configure Twilio Verify geographic permissions for the countries served and
   confirm actual SMS delivery there. Some destinations may be unavailable.
4. Exercise OTP, mandate authorization, the scheduled first charge, cancellation
   and webhook handling with the actual provider configuration before rollout.

The existing GeoIP/network controls remain; the old India/US country allowlist
is removed. Production phone-first onboarding uses a provisional account and
the verified phone plus business declaration to determine its saved country.

## Validation

- Three regression tests reproduced the original failure before the repairs.
- **457 Node tests passed**, zero failed or skipped, including 21 new tests.
- The catalog test covers national and international parsing for every one of
  the 245 entries, and checks India-only INR versus global USD pricing.
- Eleven countries exercise OTP, plan selection, rejection of browser pricing
  overrides, pending authorization, confirmed mandate, trial entry and invoicing.
- **61 Chromium checks passed**: US, India, Canada, UK, France and Nepal at
  1440×1000 and 390×844, plus the standalone export. Checks include pending-OTP
  reload, price display, hosted-checkout callback wiring, workspace access,
  settings, saved time zones and invoice creation. No uncaught browser errors
  or document-wide overflow occurred in these workflows.
- All 84 JavaScript files passed syntax checks. The secret scan passed; the
  dependency audit reported zero known vulnerabilities. Only one dependency
  was added; existing package versions were unchanged.
- Provider responses were controlled test fixtures. No real SMS, payment or
  production records were used. Real devices and other browser engines were
  not covered. The PR's CI checks report locked-install and test results on
  Node 22 Ubuntu and Windows.

After updating phone metadata, regenerate the browser catalog with
`node scripts/update-phone-countries.mjs`; the catalog test detects drift.

## Provider references

- [libphonenumber-js parsing and country metadata](https://github.com/catamphetamine/libphonenumber-js)
- [Twilio Verify geographic permissions](https://www.twilio.com/docs/verify/preventing-toll-fraud/verify-geo-permissions)
- [Twilio Verify delivery coverage](https://www.twilio.com/docs/verify/verify-countries-and-regions-deliverability)
- [Razorpay subscription payment methods and international currencies](https://razorpay.com/docs/payments/subscriptions/faqs/)
