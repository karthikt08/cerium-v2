# Mandatory business setup audit

Scope: phone verification, required business information, saved wizard steps, review confirmation, workspace access gates and recovery from failed setup requests.

## Confirmed defects and fixes

| Reproduction | Corrected behavior |
| --- | --- |
| Request `/app.html::$DATA` on Windows before setup is complete. | Reject NTFS alternate-stream/drive syntax before static serving. Windows CI reproduced the original page-shell bypass; private APIs remained gated. |
| Fill a required name/address with zero-width characters only. | Required text must contain visible content; international names and legitimate joiners remain supported. |
| Submit an explicit empty, false or null invoice currency. | Reject invalid choices instead of silently choosing USD/INR. Omitted currency retains backward-compatible defaults. |
| Edit inputs or tool choices while a step is saving. | Disable the active fieldset until the request finishes. |
| Refresh a same-country wizard state or replace its review. | Populate the returned draft and clear the prior confirmation. |
| Change a draft in a second tab, then confirm the old review. | Completion requires the current owner-bound draft revision; stale reviews return 409 and refresh before reconfirmation. |
| Replace the reviewed initial details via the legacy profile endpoint. | Initial completion must use the wizard. Profile editing remains available after setup is complete. |
| Complete setup, then lose the next account/status request. | Retain successful completion and retry the next step without completing again. |
| Lose the response after the server commits completion. | A repeated request detects the changed state, retrieves the completed profile and offers continuation without resetting trial dates. |
| Fail the initial account/setup request. | Keep the signed-in flow recoverable and show Retry setup check. An outage is not treated as a signed-out session. |

## Regression coverage

- `test/business-wizard.test.js`: persisted progression, India tax requirements, authentication/CSRF/origin, owner isolation, revisions, stale tabs, duplicate confirmation, original trial dates and blocked URLs/APIs at every incomplete stage.
- `test/business-onboarding-regressions.test.js`: invisible required values, international text and currency validation.
- `test/onboarding-session-recovery.test.js`: transient outages versus a signed-out account.
- Existing phone-first, billing identity, business setup and billing regression suites continue to cover verified phones, production mandate requirements and provider callbacks/webhooks.
- `scripts/qa-business-setup.mjs`: real Chromium checks for locked inputs, refreshed drafts, confirmation reset, US national-format phone + development OTP, reload/resume, India GST errors at mobile width, stale-tab recovery, failed handoff, initial retry, lost completion response and offline preview completion/reload.

Run server and shared-validator checks with `npm test`. For browser checks, provide Playwright and its Chromium installation, then run `node scripts/qa-business-setup.mjs`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a browser executable; `CODEX_PRIMARY_RUNTIME_NODE_MODULES` can select an existing Playwright installation. The script uses disposable local accounts and databases, and builds a temporary offline preview.

The setup completion API now requires `revision` from `GET /api/business/setup` or the last saved step alongside `confirmBusinessDetails: true`. Clients must retain the revision associated with the displayed review. A 409 `business_setup_changed` requires fetching and reviewing current state; it must not silently confirm the new draft. Older open clients should reload after deployment.

No database migration is required. Existing completed profiles and trial/payment dates are preserved. SMS and payment behavior was tested with development/provider fixtures; no live SMS, mandates or charges were created by this audit.
