# CERIUM verified-phone onboarding and worldwide checkout

## Production trial security — payment first
Before CERIUM starts any new free trial in production:
1. User signs in and receives an OTP on an eligible mobile phone.
2. CERIUM saves the verified number and pins its India/INR or global/USD edition (after the
   customer separately declares their actual business billing country).
3. The customer completes [required business setup](business-setup.md): business
   and contact details, address and time zone, plus the relevant country fields.
4. Razorpay's hosted checkout requests authorization for a recurring
   subscription. CERIUM never collects PAN, CVV, bank OTP or UPI PIN.
5. The backend validates the Razorpay callback signature and re-checks the
   subscription with Razorpay; only an authenticated/active/charged provider
   state can unlock the workspace and start the one-time 15-day trial.
6. The first regular subscription debit is scheduled for **at least 15 full
   days after successful authorization**. Razorpay fixes the billing start at
   subscription creation, so CERIUM permits authorization within the next
   60 minutes and adds that hour to the 15-day start date. Depending on when
   the customer authorizes, the free period may be up to roughly one hour
   longer; it must never be shorter. A late or mismatched provider schedule
   fails closed and is cancelled, or flagged for urgent support if cancellation
   cannot be confirmed. Disclose the actual payment date, full monthly amount,
   currency, possible authorization transaction and cancellation conditions.

**Production enforces WORKSPACE_ACCESS_MODE=phone_and_mandate.** Using
`phone` or `off` in production will fail configuration validation. Your
localhost sandbox can explicitly choose `phone` for non-payment UI testing.
Live deployment still requires active Razorpay INR/USD recurring
plans, credentials, verified webhooks, international card subscriptions and the
payment methods enabled by the merchant provider. Twilio Verify geographic
permissions and delivery coverage also apply; selecting a country in CERIUM
does not enable it in the provider account. Without these, checkout fails CLOSED; never fake approval.

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
their phone has been verified, their required business details saved, and the
production payment mandate confirmed. The browser alone cannot
bypass the server gate. The access screen is `/verify.html`.

1. Sign in with Google or email. A provisional account exists but workspace
   access and write endpoints stay blocked.
2. Select the business country from the country/calling-code selector. Enter
   a national-format number (US `4155550123`, India `9876543210`, France
   `06 12 34 56 78`) or a full international number. The server parses it with
   `libphonenumber-js/max`, validates it against the selected calling code and
   stores canonical E.164. India is INR ₹500/month; all other countries are
   USD $20/month. **The customer also declares their business country.**
3. Receive SMS OTP (or local test code). The edition becomes permanent when
   verification succeeds; if there is existing priced history or a subscription,
   a conflicting edition requires manual review. Browser changes never relabel
   USD/INR amounts.
4. Complete required business setup. US and India require state and postal code;
   India also requires a GST-registration declaration, with GSTIN only for
   registered businesses. Existing users complete missing setup once; existing
   trial and paid dates are retained.
5. On LOCAL test mode `WORKSPACE_ACCESS_MODE=phone`, phone verification plus
   business completion starts the 15-day trial and unlocks the app.
6. Production `WORKSPACE_ACCESS_MODE=phone_and_mandate` additionally requires
   confirmed Razorpay subscription authorization before workspace entry.
   India can use available UPI AutoPay or cards; other countries can use eligible international cards.
   The subscription start date is scheduled 15 days plus the one-hour
   authorization window from creation. New customers receive at least
   15 full days after authorization, with an exact UTC trial end matching the
   provider-scheduled billing start. Authorization expires after one hour.
   No month-to-month debit is authorized without explicit customer consent.
   Checkout availability depends on Razorpay merchant and payment-method
   eligibility. Configure and validate providers before production rollout.

A phone's country code is **not proof of legal residency or registration**.
`+1` includes Canada and other NANP territories; other shared calling plans
also exist. CERIUM preserves the selected country instead of assuming that
`+1` means US. Shared-plan numbers still require the explicit declaration.
Roaming and virtual numbers exist. This confirms number possession and captures the business declaration,
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
`/verify.html`. Choose a country and enter a fresh test-format number, tick the
corresponding business-country declaration, and send a code. In loopback
development mode no SMS is sent; enter **000000**. Your verified phone decides
the account's edition together with the declaration. Complete the business form
next; the local trial starts when the workspace is first unlocked.

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
WORKSPACE_ACCESS_MODE=phone_and_mandate
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
  pending OTP, required business setup or payment mandate.
- `GET /api/me`: session and CSRF token, allowed before verification.
- `GET /api/billing/identity`: self-owned masked verification state.
- `POST /api/billing/identity/start`: request SMS; requires phone,
  declaredCountry matching the phone calling code, and confirmCountry=true. National numbers are interpreted using declaredCountry.
- `POST /api/billing/identity/verify`: verify OTP; atomically set edition.
- `GET /api/business/profile`: read the signed-in user's business setup status.
- `POST /api/business/profile`: validate and save required business details;
  requires verified phone, CSRF and `confirmBusinessDetails=true`.
- `POST /api/billing/subscription`: create eligible Razorpay mandate.
- `GET /api/workspace` and other business APIs: gated until requirements
  are fulfilled.

Do not claim that SMS verification proves legal residence or tax eligibility.
