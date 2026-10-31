# Trade-specific service workflows

Cerium now supports **saved, structured service reports** for HVAC/refrigeration, cleaning/maintenance and landscaping/lawn care. These build vertical depth into the existing jobs → crew → invoice workflow, without creating competing scheduling or billing systems.

## Where to use it

Go to **Field Service → Trade Workflows** (`#field/trade-workflows`). The second navigation row offers all work, HVAC, cleaning, landscaping and recommended return visits.

Create a job from a trade card, or edit a job in the existing calendar/dispatch UI. In the job modal, choose the **Trade** tier and **Service record** subview. Select a workflow and record its service type, specific customer equipment/site data, work performed, quality checklist and next recommended visit. Every checklist item can be **To review**, **Done** or **Not applicable**.

| Business | Structured details | Service checklist | Common services |
| --- | --- | --- | --- |
| HVAC | Equipment type, make/model, asset serial, equipment location, filter, operating readings, diagnosed fault | Service scope, access/electrical isolation assessment, filters, coils, drain, controls, post-service checks, handover | Repair, preventive maintenance, installation, return visit |
| Cleaning | Property, room/zone count, scope, priority areas, surface restrictions, supplies, reported issues | Site/scope, hazards, surfaces, kitchen, washrooms, floors, waste, quality walk-through, handover | Routine, deep clean, move-in/out, commercial, return visit |
| Landscaping | Site zone, area, work scope, irrigation, plant/material notes, weather, disposal | Hazards/utilities, scope, equipment, lawn, beds, irrigation, cleanup, inspection, handover | Lawn, planting, irrigation, redesign, return visit |

Each report is saved **on the job** in a new additive SQLite JSON column (`jobs.vertical_workflow_json`). Older jobs remain unchanged; edits to scheduling, billing, and job status keep the existing report. Clearing a workflow intentionally removes that report from that job.

## Return visits

The Trade Workflows view shows checklist completion and planned return dates. Dates in the next 30 days are highlighted in the summary, but they are **recommendations, not appointments**. A user can explicitly click **Add follow-up** to create a standard Cerium callback, with a duplicate-open-task check. No message is sent and no future job is booked automatically. Open the calendar to schedule the return appointment.

## Validation and privacy

The same shared workflow definition is imported by Node and the browser. The server validates trade IDs, service type, checklist status, known field names, maximum text lengths and real ISO dates on every job create/update. Existing owner-scoped job endpoints, plan read-only restrictions and account exports cover the saved report. The job edit form retains the usual server-side permission rules; a hidden tool never grants rights.

Reports are manual operational notes, **not inspected, verified or certified** by Cerium. HVAC equipment readings and safety assessments are user-entered, not instrument readings or statutory electrical/refrigerant records. Cleaning and landscaping inspections are not regulatory sign-offs.

## Scope boundaries

This release does not add automatic recurring bookings, GPS dispatch, equipment telemetry, material consumption, customer signatures, payroll, compliance certificates or auto-sending reminders. Those require separate workflow and permissions design.

## Verification

```sh
npm test
node scripts/qa-workspace-navigation.mjs
node scripts/qa-workspace-capabilities.mjs
```

The test suite includes trade definition validation, deep-link coverage, report create/update/persistence, rejects malformed records, owner isolation and export checks.
