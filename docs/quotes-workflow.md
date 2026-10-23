# CERIUM Feature 4 — Estimates & Quotes

## What this release adds

A complete, **manually shared** estimate-approval workflow:

**Lead → Estimate Draft → Customer Approval Link → Accepted → Scheduled Job → Completed Job → Draft Invoice → Payment Reminder**

This adds no recurring subscriptions, external database, notification credits,
third-party libraries, or additional VM services. The existing Node.js + SQLite
backend and Oracle VM deployment strategy remain unchanged.

## How to test it locally

1. Run \`npm test\` and \`npm start\`.
2. Open \`http://localhost:3000/app.html#quotes\` (sign in first).
3. Choose **Create estimate**.
4. Optional: choose an existing lead to prefill name, email and service address.
5. Enter an estimate title, customer, and billable line items:
   - AC inspection: quantity 1, rate 50
   - Compressor labor: quantity 2, rate 75
   - Replacement part: quantity 1, rate 40
   - **Expected total: 240** in the workspace's billing currency.
6. Save as Draft. Confirm nothing was emailed, billed, or scheduled.
7. Choose **Create approval link**. Review the confirmation dialog; this locks
   the quote's line items so the customer approves an immutable offer.
8. The link is copied to your clipboard; paste it into a private/incognito
   browser window (you do NOT need to sign in as the customer). If automatic
   clipboard copying is unavailable, use the displayed prompt to copy it.
9. Check the total and click **Accept estimate**.
10. In CERIUM go back to Estimates & quotes and refresh. The estimate now says
    Accepted. Click **Schedule job →** and choose a valid appointment time.
11. In Jobs & dispatch, finish the newly scheduled job.
12. In Invoices, see the automatically generated **Draft** for the same line
    items and total. It is not emailed or charged automatically.
13. Mark paid only after receiving payment. Reminders are a separate,
    consent-gated workflow.

## Backend data model

- SQLite \`quotes\` table with foreign keys to existing users, leads, and jobs.
- Quote snapshots (title, customer, address, items, total in cents and currency)
  remain intact if the source lead or converted job is subsequently deleted.
- Draft estimates can be edited; sent estimates are immutable.
- Accepted and declined are terminal customer responses; accepted can be
  converted **once** into a Scheduled job.
- All owner writes enforce the same session, CSRF, same-origin, and trial checks
  as jobs/invoices. Owner read actions are limited to their own workspace.
- Customer-facing links use a session-secret-backed HMAC tied to quote ID, owner
  ID, and the original issue timestamp; links expire after 30 days.
- Customers do not need CERIUM accounts; opening a link is read-only.
  Explicit POST Accept/Decline is required to record a decision.
- Job creation and quote conversion happen in one SQLite transaction; crew
  clashes or invalid dates roll back both records.
- Completed jobs continue to use the existing job-to-draft-invoice code.
- Workspace exports and account/data clearing include quote records.

## What this does NOT do yet

- It does not automatically email or SMS a customer. **The owner must copy and
  share the private link.** Marking an estimate Sent means a shareable link is
  ready; it does not certify an email was delivered.
- It does not collect card payments or e-signatures; pressing Accept records
  a customer response but does not constitute a full legal e-signature workflow.
- It does not schedule an accepted quote automatically: the owner chooses the
  appointment and crew to avoid accidental bookings.
- Quote link possession allows the recipient to view and answer that quote;
  share only with the intended customer. Do not post public links or paste
  them into analytics tools. Signed links are invalidated if SESSION_SECRET
  rotates; reuse the same secret between deployments.

## QA and release gates

- Execute the automated test suite, not just a syntax check.
- Verify in an incognito window that the customer can approve without login.
- Verify bad or expired links, double-click approval, edited quotes after
  publication, crew schedule conflicts, job → invoice amounts, and deletion.
- Review quote privacy/terms language before letting customers use the public
  approval link, particularly the meaning of an acceptance.
- Enable HTTPS before distributing public customer links. The production
  config already requires HTTPS.
- Keep a tested SQLite backup and a stable production SESSION_SECRET.

Implementation is deliberately compatible with CERIUM's current
Oracle VM + SQLite architecture; Supabase/Firebase are optional, not required.
