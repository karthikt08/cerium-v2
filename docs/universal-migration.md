# Universal spreadsheet migration

Open Settings & Customization → Spreadsheet Migration → Preview & Import. Select a record type and CSV/XLSX file, preview, review column mappings and validation, then explicitly choose **Import reviewed records**. Navigation and preview do not change business records or send messages.

Supported targets:

| Target | Required fields | Behavior |
| --- | --- | --- |
| Leads | Name | Existing lead validation; no automatic follow-up or review creation |
| Jobs / appointments | Title, customer, start, end | Existing job validation; historical completed jobs do not generate invoices |
| Historical invoices | Customer, work, pre-tax amount, issue date, due date | One service line plus supported tax fields; optional total must match validated calculations; original paid date can be retained |
| Expenses | Description, date, amount | Positive two-decimal amount; recorded currency retained |
| Inventory | Name, SKU, quantity | Unique SKU; non-negative two-decimal quantity |

Files are bounded to 2 MB, 2,000 data rows and 40 columns. XLSX uses cached values; formulas are never evaluated. The user can choose the worksheet and one of the first ten header rows. Automatic detection scores recognizable field names in those rows. ISO dates, explicit DMY/MDY dates and Excel date serials are supported. Job timestamps use business-local minute precision.

Any source column can be mapped to a supported target field. Unmapped values are preserved with their original column labels in owner-scoped import metadata, visible under Preserved Custom Fields and included in exports. This is retained source data, not a custom-field schema editor. Mappings can be named, saved and deleted. A saved mapping applies only when its target and source headers match.

Preview runs the actual record validators inside a rolled-back transaction. All rows are checked; the UI displays up to 100 row results. Commit runs validation again and rolls back the entire import if any row is invalid. Existing records are never overwritten. Repeated external references, fingerprints, normalized lead email/phone and inventory SKUs are detected as duplicates. Distinct references allow legitimate otherwise identical invoice/job/expense records. Duplicate rows are shown and skipped.

Historical invoices retain the workspace currency; no automatic conversion occurs. Their original external number is stored as a reference while Cerium assigns its own invoice ID. The importer does not reconstruct multi-line invoices, tax filings, bank settlements, or historical automatic messages. Use separate rows/workspaces or manual existing editors where appropriate.

Mappings and preserved fields belong to the signed-in owner. Imports require an active workspace, same-origin requests, CSRF protection and explicit confirmation. Export and confirmed workspace clearing include the new data.
