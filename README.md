# CERIUM — Unified Production Platform & Web Workspace

## Run the current application

Run `npm start` from the repository root and open `http://localhost:3000/app.html`.
Business setup is required before workspace entry: phone verification, business
basics, address, India GST declaration when applicable, review/confirmation,
then production payment authorization. Saved steps resume after a reload.

For an offline UI preview, run `npm run preview:export` and open
`output/cerium-preview.html`. It starts with an empty business and the same
required wizard; it does not send SMS or collect payments. Setup information
is saved in this browser, while preview workspace records reset on reload.

The earlier upload in `demos/webapp-v2/` is an archived standalone reference.
Its separate sample-data app and `preview.html` do not represent the current
server application's onboarding. Use the root application or a newly generated
preview to test the current flow.

---

**Cerium** is an operations workspace for independent HVAC, plumbing, electrical, landscaping, cleaning, and general contracting businesses. India is ₹500/month; other countries are $8–$20 USD/month by country income group, with equal features at every price. Country-aware phone verification and business-local scheduling are built in.

It merges the marketing landing suite, authentication system, operations web application, and premium subscription billing into one unified software product.

---

## Key Features

1. **Morning Launchpad & Workspace Dashboard**:
   - Rotating daily contractor quotes and morning mindset reminders.
   - Three-second brief: Callbacks due today, open and overdue invoices, and bank matches.
   - Leads pipeline management with stage transitions (New, Quoted, Booked, Done, Lost).
   - Scheduled callback reminders.
   - Professional Invoices generator with Net 15/30 terms, custom items, and print-ready PDF styling.
   - Read-only bank deposit matching and reconciliation.
   - Customer review tracking with Google review links.
   - Message the founders directly from the workspace.

2. **Complete Authentication & Security**:
   - Real email and password registration and login using Node.js `scrypt` cryptographic hashing.
   - Official Google OAuth 2.0 PKCE authentication flow.
   - Secure HttpOnly, SameSite lax session cookies.
   - Dynamic CSRF protection (`X-CSRF-Token`).
   - Password reset flow with time-limited tokens.
   - Rate limiting on authentication, write operations, and global requests.
   - Complete data isolation: every database record is owned by and isolated to the authenticated user.
   - Zero-leak account deletion ("Delete my data") with SQLite `secure_delete = ON`.

3. **Premium Subscription Tier (India ₹500 / Global $8–$20 per month)**:
   - Required phone verification and business setup before payment authorization and workspace access.
   - One-time 15-day free trial begins after successful provider authorization, with countdown tracking.
   - Cerium Pro tier (₹500/month in India; $8–$20 USD/month elsewhere) for unlimited leads, invoices, and automated matching.
   - Server-side recurring subscription creation (`/api/billing/subscription`).
   - Signature-verified authorization and provider-state confirmation (`/api/billing/subscription/verify`).
   - Raw JSON webhook signature verification (`/webhooks/razorpay`).
   - Loopback-only simulated SMS for local testing; payment providers are mocked only in automated tests.
   - Server-enforced feature entitlements.

4. **Production Architecture**:
   - Node.js 22+ with Express 5.
   - High-performance SQLite via `better-sqlite3` with WAL mode and foreign keys.
   - Strict Content Security Policy (CSP) via Helmet.
   - No external frontend frameworks or heavy build-step dependencies required.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment settings
cp .env.example .env
npm run gen-secret    # generates a random 48-byte SESSION_SECRET

# 3. Start the application
npm start
```

Open your browser to: **http://localhost:3000**

---

## Available NPM Commands

| Command | What it does |
| --- | --- |
| `npm start` | Starts the production server at `http://localhost:3000` |
| `npm run dev` | Starts server in watch mode with automatic restart on file changes |
| `npm test` | Runs the automated test suite (unit tests, API tests, auth tests, security tests) |
| `npm run gen-secret` | Generates a cryptographically strong random secret for `.env` |
| `npm run export` | Exports waitlist and member data as a clean CSV |
| `npm run reminders:worker` | Starts a separate, disabled-by-default invoice reminder worker for Oracle VM (requires explicit SMTP configuration) |
| `npm run backup` | Creates an atomic backup copy of the SQLite database and trims backups older than 30 days |
| `npm run check:secrets` | Scans all repository files to prevent committing API keys or secrets |
| `npm run preview:export` | Builds `output/cerium-preview.html`, a disposable offline demo of the rebuilt workspace |
| `npm run navlm:evaluate` | Validates the Cerium-specific, zero-API-cost navigation model against held-out examples |

See [workspace rebuild and verification](docs/workspace-rebuild.md) for the new interface, regression fixes, and testing scope.

---

## Documentation

- **[SETUP.md](SETUP.md)**: Step-by-step guide for local setup, Google OAuth setup, Razorpay configuration, and production deployment.
- **[ARCHITECTURE.md](ARCHITECTURE.md)**: Deep dive into the database schema, security model, and API endpoints.
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Production deployment instructions for Linux VPS, Docker, Fly.io, Render, and DigitalOcean.

## Worldwide phone verification and pricing

Choose a business country and enter a national-format number (for example, `(415) 555-0123` for the US), or the full international number. Production access requires **phone verification → business setup → recurring payment authorization**. India uses the ₹500 INR plan; other supported countries use $20 / $16 / $12 / $8 USD plans by income group. See [country pricing and local invoices](docs/country-pricing-invoices.md) for the current policy, plan configuration and invoice currencies, [global phone and pricing](docs/global-phone-pricing.md) for provider setup and coverage, and [required business setup](docs/business-setup.md) for required fields, existing-account behavior and validation.
