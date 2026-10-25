# CERIUM worldwide access and regional pricing

## Customer-facing policy

- New workspaces outside India: USD $20/month after an authorized 15-day trial.
- New Indian workspaces: INR ₹500/month after an authorized 15-day trial.
- Server-verified IP suggests the initial country. In production phone-first onboarding, the declared business country plus successful phone OTP pins the plan. Arbitrary browser currency or amount fields cannot choose the subscription price.
- No country allowlist restricts signup. Unknown location and detected VPN/proxy/Tor signals remain subject to the existing network checks in IP-gated mode. Phone-first accounts are provisional until verified; IP is advisory in that flow. IP intelligence is fallible; offer support for mistaken blocks.
- Public marketing pages, pricing, login and legal notices remain available to visitors worldwide, including waitlist access.
- Existing users can sign in and use their original workspace while travelling or using privacy networks. Their stored country and currency never change based on a new connection.
- The original subscription must be cancelled and reviewed before any legitimate business-country migration; historical financial values are never relabelled.
- India invoice UPI: invoice previews can open the payer's UPI app with merchant VPA, amount and note. **This is an external payment intent, not confirmation of transfer.** Merchants must reconcile bank receipts manually.
- India CERIUM subscription: Razorpay subscription checkout may offer **UPI AutoPay** if Razorpay enabled it for the merchant and customer's app/bank. No recurring debit without explicit user approval, signed verification and provider confirmation.

## Setup and launch blockers

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
India, international countries, unknown country codes, VPNs, proxy headers and a failed provider.

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
- Existing accounts remain usable from abroad. In IP-gated mode, new signups from flagged networks must contact support or retry from a verifiable connection.
- Do not promise 100% VPN detection; residential proxy traffic can evade
  IP intelligence and legitimate network privacy tools can be false positives.
- This is an access check, not legal confirmation of a customer’s
  residence, payment method eligibility, tax domicile or export compliance.
- Confirm provider data sharing and regional marketing conditions with legal
  counsel before production.

Source: https://ipapi.is/developers.html

For the country selector, national phone formats and provider coverage, see [global phone and pricing](global-phone-pricing.md).
