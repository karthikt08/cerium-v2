# CERIUM — Job → invoice automation

## What it does

When a job changes to **Completed**, CERIUM creates one **Draft** invoice in the
same SQLite transaction. The draft contains the customer, service address, job
title, and billable labor/material line items from that job. When the job is
linked to an existing lead, the customer's email is carried over as well.

- **No sending:** "Sent" is an internal record status. CERIUM does not email or
  message an invoice as part of this feature.
- **No payment:** completion does not attempt a charge or contact Razorpay.
- **Review before sending:** a draft with zero pricing cannot be marked "Sent"
  or "Paid"; edit the line items in Invoices first.
- **One draft per job:** a permanent `invoice_generated` flag prevents duplicate
  generation, even if a job is reopened/completed again or its first invoice is
  deliberately deleted.
- **Financial record preservation:** deleting a job detaches its invoice instead
  of deleting it.
- **Existing data stays intact:** an additive SQLite migration adds a nullable
  `invoices.job_id` reference, indexed uniquely per workspace, plus two job
  billing fields. Existing invoices keep their identifiers.
- **Trial rules:** expired accounts remain read-only, including job completion
  and invoice editing; exports retain invoice-source references.
- **Multi-tenant protection:** all source job and invoice operations remain
  scoped to the signed-in owner.

## User journey

1. Go to **Jobs & dispatch** and create or edit a scheduled job.
2. Add up to 20 billable line items with descriptions, quantities, and rates.
3. Mark the job **Completed**; the invoice is created as a **Draft**.
4. Open that job and click **Review invoice**.
5. From **Invoices**, edit the item prices, save, and only then change the
   invoice status. Review its preview before using it externally.

If an old completed job already existed before this feature, CERIUM does not
retroactively create an invoice on server startup. Editing that job with status
`Completed` generates one draft if it has never generated one before.

## Intentionally out of scope

This is the invoice-drafting stage, not a payment gateway or a GST/US tax engine.
It does not implement tax calculation, delivery, reminders, invoice emailing,
Razorpay charging, or government-compliant tax forms.

## Testing locally

Run:

```cmd
git checkout feat/job-to-invoice-automation
npm test
npm start
```

Open `http://localhost:3000/app.html#jobs`. Try completing a job twice,
setting an invoice's draft total to zero, editing multi-item billing, and checking
that another account cannot access its jobs/invoices.

No cloud hosting, paid APIs, or GitHub Student credits are needed for these tests.
