# CERIUM India Edition — pilot branch

## Purpose and boundaries

India and global USD editions share one Express/SQLite codebase. A **new, empty**
CERIUM workspace can choose **India — INR** in Settings, separately from the
existing US — USD edition. Switching is rejected if there is leads, quotes,
jobs, reminders, invoices, payments, bank transactions or subscription
history: **old values are never exchange-rate converted or relabeled**.

The India edition introduces a **pilot GST invoice draft** and configurable
INR recurring subscription. This is not a certified GST accounting service.

## Included

- **Business profile:** state/UT of GST registration, optional supplier GSTIN,
  UPI VPA for manual customer-payment instructions, Asia/Kolkata time zone.
- **Invoice editor:** optional customer GSTIN, HSN/SAC, place of supply and
  business-selected GST percentage.
- **Tax arithmetic:** taxable base + CGST/SGST for same-state supplies, or
  IGST for different states, with UTGST for applicable territories; rupee
  figures are rounded to two decimal places and stored on each invoice.
- **Customer preview/print:** supplier GSTIN, customer GSTIN, place of
  supply, code, split taxes and total, and optional UPI ID. Printed invoices
  are explicitly marked **DRAFT GST TAX INVOICE** when GST is shown.
- **Safety:** prevent GST-registered owners from marking unreviewed GST
  invoice drafts as sent/paid. UPI payment instructions **do not** mark
  anything paid; confirm bank receipt manually.
- **Subscriptions:** server selects an entirely separate Razorpay plan for
  the India edition, validates the provider's amount, currency (INR) and
  monthly interval, and uses the same signed subscription verification and
  webhook mechanism as the global USD edition. INR plan: **50000 paise/month**.
  Checkout returns 503 until Razorpay credentials, webhook verification
  secret, and regional plan are configured.

## Configure subscriptions

In your `.env`:

- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_IN_PLAN_ID=plan_...` configured in Razorpay Dashboard
- Keep existing `RAZORPAY_PLAN_ID=plan_...` for the USD $20 plan and
  `CURRENCY=USD` as the server's default.

The Indian plan MUST be INR 50000 minor units every month. Authorise
recurring UPI Autopay/cards/eMandate only when your merchant account and
supported payment method are enabled, and only with the customer's explicit
mandate consent. Do not enable production billing without tax-treatment
and cancellation/refund reviews.

## What is **not** implemented

- GSTN verification of GSTIN identity or status; code validates input
  **format only**. Do not claim official GSTIN validation.
- E-invoice **IRN/QR code**, IRP integration, GSTR-1/GSTR-3B reporting,
  e-way bills, reverse-charge handling, cess, discounts, composition
  scheme, exemption schedules, per-line mixed GST rates, or automated tax
  classification.
- Regulatory invoice-series rules for each financial year, full address,
  delivery, signature and issue-date compliance; current invoice numbers
  use the original shared CERIUM global sequence. Get a CA to review.
- Verified automatic payments **on customer invoices**. Their UPI ID
  field is informational; no payment link or bank settlement proof is
  implemented.
- Live merchant underwriting, production settlements, and 15-day trial
  authorization with Razorpay India's real payment methods have not yet
  been end-to-end validated.

**Do not issue these draft documents as statutory GST invoices yet.**
Have a CA validate tax classifications, rate, state rules, return
requirements and invoice serialization before general Indian launch.

## How to try the pilot

1. Create a **new empty** account and open Settings.
2. Choose **India — INR** under Edition, then Save.
3. Add business registered state (two-digit GST state code), GSTIN only
   if actually registered, optional UPI ID and Save.
4. Create a new invoice in INR, enter customer/place-of-supply state,
   correct HSN/SAC and applicable GST rate, then preview and print.
5. Check intrastate and interstate calculation and that the UPI ID is
   shown as an instruction rather than automatic collection.

Run `npm test`. CI on this branch executes full Node tests and syntax checks.
Don't deploy this branch as production until GST legal, tax, billing and
user-acceptance reviews are completed.

Sources:
- CBIC Rule 46: https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001
- Razorpay recurring methods: https://razorpay.com/docs/payments/subscriptions/supported-payment-methods/

## Customer invoice handoff and QR (October 2026)

- From an invoice preview, **WhatsApp**, **SMS** and **Email** open drafts with the invoice number, customer, work, total, due date and available UPI URI. No message is sent by CERIUM and no paid messaging API is required. WhatsApp uses a `wa.me` share link; phone and email apps are opened via `sms:` and `mailto:`.
- These drafts are *summaries*, not secure online invoice pages or PDF attachments. Use **Print / save PDF** to save the complete invoice and attach it separately if needed. Desktop SMS links depend on the visitor's device/app support.
- Eligible Indian INR invoices with a saved valid supplier UPI ID and a positive balance show an **offline-generated, printable UPI QR** and a direct app link, both containing the invoice's snapshotted UPI ID and exact displayed total. Paid invoices suppress the pay prompt. Other editions never display the UPI controls.
- Customer payment happens in an external UPI app. CERIUM has no settlement confirmation: users must verify the receipt before marking Paid. The QR library is included locally under the [MIT license](licenses/qrcodegen.LICENSE.md); payment data is not sent to an image/QR service.
