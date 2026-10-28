# Cerium Copilot MVP — business awareness

Cerium Copilot is the next step from **Ask Cerium**. The floating assistant keeps the existing navigation and verified workflow help. For five explicit account-data questions, its responses are instead calculated from the signed-in account's current Cerium workspace records.

## Try it

Sign in, open **Cerium Copilot**, and ask:

1. "What should I focus on today?"
2. "Which invoices are overdue?"
3. "Which customers need follow-ups?"
4. "Which leads have stalled?"
5. "How is my business performing this month?"

The interface also exposes these in its suggested prompts. Invoices, follow-ups, jobs and leads are linked with the existing verified destination registry.

## Precise scope and definitions

- **Priorities:** count overdue invoices, unfinished follow-up tasks due by the business-local date, active jobs scheduled today, and older open leads.
- **Overdue invoices:** saved invoice records in Overdue status or Sent with a due date earlier than the business-local date. Excludes Draft and Paid records. The sum represents invoice face value, not verified receivables or bank funds.
- **Follow-ups due:** unfinished saved Follow-ups tasks with due dates up to and including the business-local day. Lists at most four names/tasks, derived only from the signed-in account.
- **Older open leads:** leads in New or Quoted created at least seven calendar days ago. This is **not** evidence of no contact or activity: last-stage-change and last-contact information are not evaluated.
- **Monthly activity:** invoices with an issue date during the current business-local month, the subset currently marked Paid, and leads created during that month. Invoice totals are **not** recognized revenue, profit, or collected payments.

All calculations are deterministic JavaScript, use the account's currency and business-local date, and handle empty workspaces. No model guesses totals. Copilot does not create tasks, send messages, update records, or make autonomous decisions.

## Security and architecture

- The existing `POST /api/assistant/message` endpoint keeps login, same-origin, CSRF and rate-limiting checks.
- The new `server/copilot.js` intent resolver opts in only to explicit questions about a signed-in business's own data.
- The server loads that user's workspace through `db.getWorkspace(req.session.userId)`, performs the calculations locally, and returns a bounded read-only response. It never passes workspace records to OpenAI, Ollama or other external AI providers.
- New Copilot navigation destinations must pass through the existing `trustedGuideLink` allowlist.
- Non-Copilot questions continue through the existing Cerium Guide implementation, including configured optional AI providers. That provider may still receive *typed questions*, as before. No customer or invoice records are added to those requests.
- This is a minimal business-awareness foundation, **not** a generative business agent or a financial forecasting engine. Its recommendations are rule-based, and its responses must not be described as autonomous actions or bank-verified analytics.

## Verification

Run `npm test` to cover intent recognition, money/date calculations, empty state behavior, account separation, endpoint authentication and existing guide compatibility. The `test/copilot.test.js` fixtures intentionally include paid/draft invoices, already completed tasks, and completed leads to guard against incorrect claims.

## Next iteration (not part of this MVP)

Introduce explicit server-owned read-only tools with tighter SQL summary queries, opt-in AI reasoning grounded in those tool results, request-level data minimization, activity/audit logs, and review-before-write workflows. Python is not required to ship the MVP.
