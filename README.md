# CERIUM — Unified Production Platform & Web Workspace

**Cerium** is a unified, production-ready web platform and operations workspace designed for independent trade contractors, service businesses, and small crews.

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

3. **Premium Subscription Tier ($20/Month)**:
   - 15-day free trial on signup with countdown tracking.
   - Cerium Pro tier ($20.00 / month) for unlimited leads, invoices, and automated matching.
   - Server-side Razorpay order creation (`/api/billing/order`).
   - Signature-verified payment completion (`/api/billing/verify`).
   - Raw JSON webhook signature verification (`/webhooks/razorpay`).
   - Instant in-app test simulation mode for developer testing without live cards.
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
| `npm run backup` | Creates an atomic backup copy of the SQLite database and trims backups older than 30 days |
| `npm run check:secrets` | Scans all repository files to prevent committing API keys or secrets |

---

## Documentation

- **[SETUP.md](SETUP.md)**: Step-by-step guide for local setup, Google OAuth setup, Razorpay configuration, and production deployment.
- **[ARCHITECTURE.md](ARCHITECTURE.md)**: Deep dive into the database schema, security model, and API endpoints.
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Production deployment instructions for Linux VPS, Docker, Fly.io, Render, and DigitalOcean.
