# Custom Payment Dues

Cerium includes **Billing & Payments → Custom Dues** for businesses that track
balances, installments, advances or external commitments which do not fit their
Cerium invoice payment terms.

A due is an owner-entered, manual record with:
- Customer/party name
- Description (e.g. "Advance", "Second installment", "Outstanding balance")
- Amount in the saved business currency (2 decimal places)
- Due date (YYYY-MM-DD)
- Optional reference and notes
- Open or manually Settled status

To split a balance into installments, add separate due records and give each
a distinct description and date. Dues are tenant-isolated, validated server-side,
available in workspace export and removed by Clear workspace / Delete account.

**Financial safety:** A due does not automatically issue an invoice, apply GST,
collect funds, notify a customer, alter the invoice receivables totals, or match
bank transactions. Marking a due settled requires owner confirmation that funds
were actually received. A settled due is still a manual assertion, not verified
settlement evidence. The screen keeps due totals separate from invoice totals;
it never adds them into dashboard revenue and risks double counting.

The same feature is available when the Payments module is enabled. Hiding
Payments in Customize Tools does not delete due records. Editing is subject
to the existing trial/plan, currency, authentication, CSRF and rate-limit checks.

## Spreadsheet migration follow-up

The current spreadsheet importer accepts leads, not custom dues. Do **not** map
arbitrary financial spreadsheet columns to invoices or silently create debts.

Smart Import can later gain a dedicated "Payment Dues" target after showing
the user a preview for: customer, description, date, amount, currency and
reference, with explicit date/currency interpretation and duplicate review.
Keep original amounts, link to invoices only after explicit user approval, and
never infer that a payment has already settled.

## Manual QA

1. Navigate to Billing & Payments → Custom Dues (Payments tool enabled).
2. Create a due, edit its amount/date and reopen it after marking settled.
3. Confirm that the invoices, payment matches and financial dashboard totals do
   not change; no reminder or payment is sent.
4. Try bad dates, negative amounts, huge values and unconfirmed settlement.
5. Check mobile width, keyboard controls, read-only mode and full export/clear.

## CSV / Excel import

Use **Billing & Payments → Custom Dues → Import Excel / CSV** for historical
balances and installment dates. Each row represents **one due**, not an
entire multi-line invoice. Match customer, amount and due date columns; add a
description or use the fallback "Imported payment due". Choose the worksheet,
header row and the correct local date convention. Unmatched columns must be
preserved in Notes or explicitly skipped, and all amounts are confirmed against
the business's saved invoice currency. The preview lists duplicates and invalid
rows; imports do not mark any due as paid.

For other layouts (multiple item rows per order, separate customer master sheets,
complex installment schedules) do not flatten or guess relationships. Those
are available in Settings & Customization → Spreadsheet Migration, with explicit owner mapping and preview; see [universal migration](universal-migration.md).
