# Customer and lead spreadsheet import

## Where to find it

In the connected workspace, open **Leads → Import CSV / Excel**, or **Settings → Your data → Import customers / leads**.

1. Choose a UTF-8 CSV or an Excel .xlsx workbook. Legacy .xls must be saved as .xlsx or CSV.
2. Cerium reads the header row, guesses field mappings and previews the results. Adjust the mapping if column names differ.
3. Review the ready, duplicate, and invalid counts and the row-level errors. No data is written during preview.
4. Click **Import N leads** to add valid, nonduplicate rows. Close the dialog to cancel without changes.

Supported columns: customer name (required), phone, email, address, source, pipeline stage, estimated value, follow-up date and notes. All other columns are ignored. For .xlsx, the first worksheet in the workbook tab order is read, with sheet-number fallback for nonstandard workbooks; only cached cell values, inline text and shared strings are supported. Formulas are never evaluated. ISO YYYY-MM-DD dates and Excel date serials are supported. New, Quoted, Booked, and Done are valid stages.

Limits: 2 MiB uploaded file, at most 2,000 data rows and 40 populated columns per import. Split larger sources into batches. The import enforces server-side name, email, amount, date, and length validation; invalid rows are skipped with visible errors. CSV is UTF-8 with comma, tab or semicolon separators and quoted cells.

### Data safety

- Preview uses the same validation and duplicate logic as import and makes no changes.
- The server parses the original file again when committing. An SQLite transaction adds all eligible rows together; unexpected errors roll the transaction back.
- Existing leads are **never overwritten or deleted**. Duplicates are skipped by normalized email or phone; records lacking both are compared using normalized name and address. Duplicates within the uploaded file are also skipped. Duplicate matches are restricted to the signed-in user's records.
- Historical leads import without generating reminders, invoices, payments, or review-request records. A populated follow-up date is stored as a date field but does not schedule outreach.
- Account, CSRF, same-origin, paid/trial entitlement, currency and onboarding gates apply to imports. The file is not retained by Cerium outside this request; previews are not saved. Avoid uploading files containing data you are not permitted to handle.
- CSV and .xlsx are parsed using bounded server code with no executable spreadsheets or third-party scripts, and zipped workbook data is capped during inflation.
- This is a **customer/lead migration**, not a historical invoice, accounting, or tax-ledger import. For historical invoices, use the existing export or request a separately reviewed migration.

### Regression tests

Run npm test -- test/spreadsheet-import.test.js for focused import tests, and npm test for the complete suite. Test coverage includes CSV quoting, XLSX shared/inline strings and sparse cells, auto mapping, bad files, invalid mappings, preview non-mutation, owner isolation, idempotence, unintended reminder/review side effects, CSRF, cross-origin requests and trial expiry.
