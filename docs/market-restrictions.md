# Region gating (India and US pilot)

CERIUM uses server-side IP intelligence to allow traffic geolocated to India (IN, INR ₹500/month) and the United States (US, USD $20/month). The account's edition is selected at registration, including Google OAuth registration, from the verified visitor region. The pricing provider checks the saved account region against the visitor region before checkout.

**To enable:** Configure `MARKET_IPAPI_KEY` using a real ipapi.is API key. For localhost development, market enforcement is **off** unless `MARKET_GATE_ENABLED=true`; this avoids breaking localhost login/tests, and you can still select India in Settings. In production, enforcement is **on** and cannot be turned off, and the server refuses to start without a valid IP intelligence key.

**Deployment trust:** CERIUM uses Express `req.ip`. Configure `TRUST_PROXY` ONLY for the exact trusted reverse proxies you deploy. Block direct access to the origin if behind one. Otherwise an untrusted forwarded IP header can spoof the billing region. Never accept country codes supplied by the browser or anonymous request headers.

**Detection limits:** The provider flags known VPN, proxy and Tor networks, but cannot find every proxy. This is best-effort risk classification, not a guarantee of physical location. A flagged network receives 403 and a user-visible explanation; turning off VPN and retrying can help, and false positives need manual support review. Country-unknown or API outages fail closed (503) while enforcement is enabled. Cache IP lookups for five minutes; provider outages are cached for ten seconds. API calls do not expose secrets to the browser. The health endpoint and signed payment webhooks are not gated.

**OAuth:** The Google OAuth flow is already in the code; configuring the ID/secret in your local `.env` makes it available locally. An IP-geofenced production domain still needs its OWN callback URL registered at Google, with a secure production BASE_URL.

**Important:** The ISP's apparent IP location is not proof of the customer's business registration location or tax residence. Pricing based only on IP is vulnerable to travel and network churn. Existing subscribers on business trips can be locked out. A future version should allow manual verification of a business's billing location, maintaining consistent currency and taxes. Get a privacy-law review before deploying third-party IP inspection.

Provider docs: https://ipapi.is/developers.html
