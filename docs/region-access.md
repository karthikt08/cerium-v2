# CERIUM regional launch gate (draft, US + India)

CERIUM's **server** checks the connecting public IP using ipapi.is. It does not
trust country, payment amount or VPN status supplied by the browser.

- **United States (US):** USD $20/month after the 15-day trial
- **India (IN):** INR ₹500/month after the 15-day trial
- **Other countries:** denied (HTTP 403).
- **Reported VPN / proxy / Tor:** denied (HTTP 403) until the client disconnects,
  returns on an accepted ordinary connection and refreshes.
- **Unknown / provider unavailable:** no signup or workspace access (HTTP 503).
  Fail-closed avoids accidental price/market assignment.
- The account is permanently assigned its verified market at signup. Existing
  accounts are never silently repriced and money/ledger records are not converted.
  Different-country sign-ins show a support message (HTTP 409).
- Billing cancellation, account deletion, export, verified webhooks, and legal
  notices remain accessible even while market access is restricted.
- **A detected IP location is an estimate, not proof of a person's residence.**
  VPN / proxy databases have false positives and false negatives. If a user is
  incorrectly blocked, support should be able to review the case before billing.

## Configure

1. Obtain an **ipapi.is** API key from https://ipapi.is/ . The provider's
   documented free account includes limited commercial-use lookups; plan for
   usage, quota and outages.
2. Keep the key **only on the backend**, as an environment variable:
   `GEOIP_API_KEY=...` (never commit or ship it to public JS).
3. In **production**, set `REGION_ACCESS_MODE=enforce`. The server refuses
   to start in production with `off` or without a usable key.
4. Configure `TRUST_PROXY` correctly. A public-facing direct Express server
   must use `TRUST_PROXY=0`. Set it to `1` only if all external requests
   enter through exactly one trusted reverse proxy that **overwrites**
   `X-Forwarded-For` and your direct app port cannot be reached by clients.
   A misconfigured public proxy permits country spoofing.
5. Configure and validate **both** Razorpay regional subscription plans:
   `RAZORPAY_PLAN_ID` (USD $20) and `RAZORPAY_IN_PLAN_ID` (INR ₹500).
   Keep the existing signed billing authorization and webhooks. Regional access
   alone does **not** enable or charge subscriptions.
6. Google OAuth is the **same existing** Google sign-in integration. Provide
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, with authorized redirect:
   `https://YOUR_DOMAIN/auth/google/callback` in Google Cloud Console.
   For local development, use `http://localhost:3000/auth/google/callback`.
   These are private deployment settings and cannot be verified from source.

## Local development

For localhost, `REGION_ACCESS_MODE=off` is the default: localhost IPs cannot
be geolocated, and your test account can still choose its edition manually.
The **automated tests** use an injected stub GeoIP provider to simulate
India, US, unsupported countries, VPNs, proxy headers and a failed provider.

Run:

```
npm ci
npm test
npm start
```

The geo gate is enforced **in the production configuration**, not when
previewing ordinary localhost without a public IP and API key.

## Privacy and operational considerations

- The server sends the requester's public IP to ipapi.is using HTTPS POST with
  the key in the request body. No financial data or login tokens are included.
- The positive or blocked decision is cached server-side for **five minutes**
  per IP; provider failures are not cached. The raw IP is not sent to the browser.
- Do not classify data-center, carrier or mobile IPs as VPNs just because they
  use such networks; only explicit provider VPN/proxy/Tor flags are blocked.
- A customer travelling abroad or using a corporate privacy proxy might lose
  workspace access. Explicit cancellation/export/account rights are excluded
  from the gate; send appeals and billing requests to support.
- Do not promise 100% VPN detection; residential proxy traffic can evade
  IP intelligence and legitimate network privacy tools can be false positives.
- This is a **launch gate**, not legal confirmation of US/Indian customer
  residence, payment method eligibility, tax domicile or export compliance.
- Confirm provider data sharing and regional marketing conditions with legal
  counsel before production.

Source: https://ipapi.is/developers.html
