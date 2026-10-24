# CERIUM regional access — compatibility note

The earlier `server/market-gate.js` module remains available for its unit tests
and for reference, but it is **not** mounted as a second middleware layer.
It was superseded by the canonical `server/region-access.js` service used
in PR #11. Activating both would contradict the newer signed-in customer
travel policy and the verified-phone onboarding journey.

**Current environment settings:**

- `REGION_ACCESS_MODE=enforce` and `GEOIP_API_KEY` for server-side
  IP intelligence on applicable registration and pricing-discovery requests.
- `WORKSPACE_ACCESS_MODE=phone_and_mandate` in production.
- `PHONE_VERIFY_MODE=twilio` with private Verify credentials for SMS OTP.

The customer's saved India/INR or US/USD edition is set through
**phone verification plus a business-country declaration**, not solely
by their current IP address. Returning customers can travel without
their existing invoices being repriced, subject to applicable controls.
Server-side Razorpay verification is required before new production
free-trial workspace access; a browser-visible price or checkout callback
does not itself authorize the subscription.

See `docs/region-access.md` and `docs/billing-identity.md` for
the active flow, limitations and deployment checklist. A phone dial code
does not independently prove tax jurisdiction or country of incorporation.
