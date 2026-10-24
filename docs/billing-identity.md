# CERIUM verified-phone onboarding and regional checkout (pilot)

## Production trial security — payment first
Before CERIUM starts any new free trial in production:
1. User signs in and receives an OTP on an eligible mobile phone.
2. CERIUM saves the verified number and pins its India/US edition (after the
   customer separately declares their actual business billing country).
3. Razorpay's hosted checkout requests authorization for a recurring
   subscription. CERIUM never collects PAN, CVV, bank OTP or UPI PIN.
4. The backend validates the Razorpay callback signature and re-checks the
   subscription with Razorpay; only an authenticated/active/charged provider
   state can unlock the workspace and start the one-time 15-day trial.
5. The first regular subscription debit is scheduled 15 days after successful
   authorization. Disclose the full monthly amount, currency, possible
   authorization transaction and cancellation conditions before checkout.

**Production enforces WORKSPACE_ACCESS_MODE=phone_and_mandate.** Using
`phone` or `off` in production will fail configuration validation. Your
localhost sandbox can explicitly choose `phone` for non-payment UI testing.
Live deployment still requires active Razorpay India/US recurring
plans, credentials, verified webhooks and the payment methods enabled by the
merchant provider. Without these, checkout fails CLOSED; never fake approval.

**Anti-abuse:** one ACTIVE account per verified phone, persistent SMS rate
limits, no new trial on a repeat login to the same account, signed checkout
responses and server-side provider state. This does not prove unique humanity:
someone may have several phones or payment methods, and a deleted account
releases its phone claim. Additional stable provider-supported instrument
fingerprints or manual reviews may help if available, but do not store raw
card data or assume Razorpay exposes a suitable fingerprint. Businesses
sharing a legitimate phone need support review, not silent repricing.


## Customer journey
CERIUM shows public pages and allows sign-in before onboarding. A signed-in
customer cannot open `/app.html`, `/app`, or any workspace API until
their phone has been verified and assigned an edition. The browser alone cannot
bypass the server gate. The access screen is `/verify.html`.

1. Sign in with Google or email. A provisional account exists but workspace
   access and write endpoints stay blocked.
2. Enter an E.164 phone number. The server recognizes eligible `+91` Indian
   mobile numbers as India/INR (₹500/month) or `+1` numbers as US/USD
   ($20/month). **The customer also declares their business country.**
3. Receive SMS OTP (or local test code). The edition becomes permanent when
   verification succeeds; if there is existing priced history or a subscription,
   a conflicting edition requires manual review. Browser changes never relabel
   USD/INR amounts.
4. On LOCAL test mode `WORKSPACE_ACCESS_MODE=phone`, phone approval starts the
   15-day trial and unlocks the app.
5. Optional `WORKSPACE_ACCESS_MODE=phone_and_mandate` additionally requires
   confirmed Razorpay subscription authorization before workspace entry.
   India can use available UPI AutoPay or cards; US can use an eligible card.
   The subscription start date is scheduled 15 days from creation in this mode,
   and no month-to-month debit is authorized without the user's explicit consent.
   Checkout availability depends on Razorpay merchant and payment-method
   eligibility. Enable this mode only after live/test payment checkout works.

A phone's country code is **not proof of legal residency or registration**.
`+1` includes Canada and other NANP territories; roaming and virtual numbers
exist. This confirms number possession and captures the business declaration,
not an independently verified jurisdiction. Handle legitimate exceptions through
support review. Verified returning customers keep their saved edition when
travelling or using VPNs.

## Local test without SMS spend or card
In your **private, untracked** `.env`:
```ini
BASE_URL=http://localhost:3000
HOST=127.0.0.1
REGION_ACCESS_MODE=off
WORKSPACE_ACCESS_MODE=phone
PHONE_VERIFY_MODE=development
```
Run `npm test`, then `npm start`. Sign in and visit
`http://localhost:3000/app.html`. You will be redirected to
`/verify.html`. Enter a fresh Indian or US test-format number, tick the
corresponding business-country declaration, and send a code. In loopback
development mode no SMS is sent; enter **000000**. Your verified phone decides
the account's edition and the trial starts when the workspace is first unlocked.

For `phone_and_mandate`, valid Razorpay test-mode keys, an appropriate
region-specific recurring plan and webhook handling are needed. There is NO
fake card authorization bypass. Do not enable the mandate gate until your
provider setup is ready or you will be locked out of the workspace.

## Security and operations
- 3 OTP sends/account within each 24-hour window, 90-second cooldown.
- 5 OTP guesses per pending request, with a 10-minute expiration.
- Phone identity stored account-scoped in SQLite, exported with account
  data and deleted with the account.
- Country changes require verified phone and are forbidden if financial
  history or subscriptions would need currency relabeling.
- Production refuses `WORKSPACE_ACCESS_MODE=off` and
  `PHONE_VERIFY_MODE=development`.
- A missing SMS provider fails CLOSED for new verified workspace access;
  sign-in, export, cancellation and manual-review contact remain available.

Set production secrets in a secure hosting environment, not GitHub:
```ini
WORKSPACE_ACCESS_MODE=phone
PHONE_VERIFY_MODE=twilio
TWILIO_ACCOUNT_SID=<account SID>
TWILIO_AUTH_TOKEN=<private token>
TWILIO_VERIFY_SERVICE_SID=<Verify service SID>
```
Twilio Verify owns one-time codes and the server calls it over HTTPS.
Confirm India SMS delivery/DLT routing, abuse controls and message costs
before launch. Payment authorizations use Razorpay hosted checkout and
subscription verification/webhooks. No card details or UPI PINs are stored
by CERIUM.

## Routes
- `GET /verify.html`: public onboarding UI; signed-in sessions display
  pending OTP / payment mandate.
- `GET /api/me`: session and CSRF token, allowed before verification.
- `GET /api/billing/identity`: self-owned masked verification state.
- `POST /api/billing/identity/start`: request SMS; requires phone,
  declaredCountry matching dial-prefix candidate, and confirmCountry=true.
- `POST /api/billing/identity/verify`: verify OTP; atomically set edition.
- `POST /api/billing/subscription`: create eligible Razorpay mandate.
- `GET /api/workspace` and other business APIs: gated until requirements
  are fulfilled.

Do not claim that SMS verification proves legal residence or tax eligibility.
