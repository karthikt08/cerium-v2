# Customer payment ledger

Billing & Payments → Payments → Payment Ledger & Allocation records manually verified receipts. The existing Custom Dues tool continues to support independent amounts, dates and due tracking.

Receipts can be partially allocated, split across issued invoices, or left unallocated for later assignment. Amounts and allocations are stored as integer ten-thousandths, preserving the precision of existing invoice calculations. No currency conversion occurs. A receipt cannot allocate more than its available amount or an invoice's remaining balance. Paid invoices and drafts cannot receive further allocations. Request keys make retries idempotent; active external references must be unique within the workspace.

Invoice totals and tax calculations remain unchanged. A fully allocated invoice becomes Paid on the latest receipt date; partial payments leave it open. Invoice previews, UPI links, sharing drafts, dashboard balances, revenue summaries and approved reminders reflect recorded allocations. Old invoices marked Paid are still counted once. Unallocated receipts are visible in the ledger and excluded from invoice revenue summaries.

Voiding a receipt requires confirmation and a reason. Its history and allocations remain visible; affected invoice balances reopen. Invoices with ledger history cannot be deleted or repriced, and active allocations prevent conflicting manual status changes or full bank matches. Account export includes the ledger. Explicit workspace clearing deletes the ledger before invoices; billing subscription history remains separate.

These records do not initiate payments, connect a live bank feed, or verify bank settlement. The operator verifies the payment and customer before saving.
