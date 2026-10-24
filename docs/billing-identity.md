# CERIUM billing-country confirmation and phone OTP (pilot)

## What is and is not verified
CERIUM has a 15-day trial with **no phone requirement**. Before someone
authorizes a **new** recurring subscription, CERIUM requires:

- A saved US/USD or India/INR account edition.
- A user declaration that their business billing country is that edition.
- Successful SMS-code verification of a phone starting with +1 (US edition)
  or +91 (India edition).
- Server-side validation on the subscription-creation endpoint. The browser
  cannot override the country, currency, amount, or verification result.

**A dial prefix is not a reliable country-of-residence or company-registration
check**. +1 is shared by the North American Numbering Plan; numbers can be
roamed or virtual. This is fraud friction, **not independent proof of business
jurisdiction**. Do not describe the country as legally "verified". Mismatches
get a support/manual-review route. Do not silently switch currencies or
invalidate accounts just because a customer is travelling or uses a VPN.

Existing subscription authorizations remain accessible. Recurring charge
confirmation stays with Razorpay webhooks. An OTP never causes a charge.

## Local testing, no card, no SMS fee
Use the untracked `.env`:
```ini
BASE_URL=http://localhost:3000
HOST=127.0.0.1
REGION_ACCESS_MODE=off
PHONE_VERIFY_MODE=development
```
Run `npm test` and `npm start`. Sign in with Google, go to
**Workspace → Settings → Billing verification**. Ensure the *saved* edition is
India or US. Enter an India `+91` mobile number or a US `+1` number
and tick the business-country declaration. Press **Send verification code**.
In local mode, **no SMS is sent**; enter `000000` in the code form.
The verified state is stored in the local SQLite database for the account.
Use disposable test phone numbers; don't enter real customer details for demos.

Rate limits persist across restarts in SQLite:
- At most 3 code sends per account in a rolling 24-hour window.
- At least 90 seconds between send requests.
- Each pending code expires after 10 minutes.
- At most 5 code-check attempts per pending request.
- A country/edition change deletes old OTP evidence.

To test again without waiting, use a *new test account* or a fresh
disposable database path. Never delete customer databases.

## Production setup
Set these **in the production secrets manager**, not in GitHub:
```ini
PHONE_VERIFY_MODE=twilio
TWILIO_ACCOUNT_SID=<your own account SID>
TWILIO_AUTH_TOKEN=<your private token>
TWILIO_VERIFY_SERVICE_SID=<your own Verify service SID>
```
Create one Verify Service and configure its fraud/sender policies.
The server uses `POST /v2/Services/{ServiceSid}/Verifications` with
`To` and `Channel=sms`, then checks a token using
`POST /v2/Services/{ServiceSid}/VerificationCheck`.
Twilio requires E.164 numbers and may charge for verification. For India,
confirm routing and applicable sender registration/DLT requirements directly
with the SMS provider before production launch.

Without a valid production verification provider, CERIUM fails closed for
**new recurring checkouts** (503), while trials, exports and existing account
access continue. `PHONE_VERIFY_MODE=development` cannot run in production
or off loopback hosts.

Before accepting production customers: review SMS deliverability, Twilio
Fraud Guard, costs/spend limits, privacy policy, business-country review
process and applicable tax requirements. A phone number is personally
identifiable data; only capture it for verification with notice.

## Endpoints
- `GET /api/billing/identity` — self-owned state; masked phone only.
- `POST /api/billing/identity/start` — logged-in user, CSRF, signed
  country declaration, per-user send limits, optional Twilio SMS.
- `POST /api/billing/identity/verify` — logged-in user, CSRF,
  limited attempts and provider-checked OTP.
- `POST /api/billing/subscription` — rejects unverified first-time
  subscribers before any provider subscription can be created.

The account's existing profile phone field **does not** verify eligibility.
Changing the edition invalidates the evidence. Existing invoices are never
converted and paid records prevent self-service edition switching.
