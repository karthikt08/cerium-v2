# Cerium Setup & Production Operations Guide

This guide provides complete instructions for running, configuring, testing, and deploying Cerium.

---

## 1. Prerequisites

- **Node.js**: Version 22.0.0 or newer (check with `node -v`).
- **NPM**: Version 10 or newer.

---

## 2. Local Setup (Step-by-Step)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```
Generate a cryptographically secure session secret:
```bash
npm run gen-secret
```
Open `.env` in a text editor and fill in your values:
- `BASE_URL`: `http://localhost:3000`
- `PORT`: `3000`
- `SESSION_SECRET`: Paste the output from `npm run gen-secret`.
- `GOOGLE_CLIENT_ID`: (Optional for local dev) Your Google OAuth Client ID.
- `GOOGLE_CLIENT_SECRET`: (Optional for local dev) Your Google OAuth Client Secret.
- `RAZORPAY_KEY_ID`: (Optional for local dev) Razorpay Key ID (`rzp_test_...`).
- `RAZORPAY_KEY_SECRET`: (Optional for local dev) Razorpay Key Secret.
- `ADMIN_EMAILS`: Your administrator email address(es), comma-separated.

### Step 3: Run the Application
```bash
npm start
```
Or for live-reload development:
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## 3. Google OAuth 2.0 Setup

To enable Google sign-in:
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project named `Cerium`.
3. Open **APIs & Services > Credentials**.
4. Configure the OAuth Consent Screen (External, User Support Email, Developer Contact Email).
5. Create an **OAuth 2.0 Client ID**:
   - Application Type: **Web application**
   - Name: `Cerium Localhost`
   - Authorized redirect URIs:
     - Development: `http://localhost:3000/auth/google/callback`
     - Production: `https://your-domain.com/auth/google/callback`
6. Copy the **Client ID** and **Client Secret** into your `.env` or production environment variables.

---

## 4. Razorpay Payments & Subscriptions Setup

Cerium supports one-time and recurring payments via Razorpay:
1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Switch to **Test Mode** during development.
3. Navigate to **Settings > API Keys** and generate key credentials:
   - `RAZORPAY_KEY_ID`: starts with `rzp_test_...` (or `rzp_live_...` in prod)
   - `RAZORPAY_KEY_SECRET`: secret key (never exposed to browser)
4. Navigate to **Settings > Webhooks** and add an endpoint:
   - Webhook URL: `https://your-domain.com/webhooks/razorpay`
   - Secret: Generate a secret using `npm run gen-secret` and configure as `RAZORPAY_WEBHOOK_SECRET`.
   - Active Events:
     - `payment.captured`
     - `order.paid`
     - `payment.failed`

*Note: In development without Razorpay keys, Cerium includes an interactive test payment simulation dialog allowing you to verify order creation, payment signatures, and entitlement updates instantly.*

---

## 5. Security & Maintenance Commands

### Automated Test Suite
Run the test suite at any time:
```bash
npm test
```
All tests run with an in-memory database and mock OAuth/Razorpay fixtures; no active internet connection is required.

### Database Backups
Create an atomic, consistent SQLite snapshot:
```bash
npm run backup
```
Automate this daily via cron:
```cron
0 3 * * * cd /var/www/cerium && npm run backup >> /var/log/cerium-backup.log 2>&1
```

### Export Waitlist / Data
Export member information to standard CSV:
```bash
npm run export > waitlist.csv
```

### Scan for Exposed Secrets
Run before every commit to ensure credentials are never tracked:
```bash
npm run check:secrets
```

---

## 6. Production Deployment

In production:
1. Do not use `.env` files on disk; inject environment variables directly via your cloud provider (Fly.io, Render, Railway, AWS ECS, or systemd `/etc/cerium.env`).
2. Set `NODE_ENV=production`.
3. Set `BASE_URL=https://your-domain.com` (HTTPS is strictly required).
4. Point `DATABASE_PATH` to a persistent mounted volume (e.g. `/data/cerium.db`).
5. Set `TRUST_PROXY=1` when behind a reverse proxy or load balancer.
6. Verify your site with `npm run check:secrets` and `npm test` before going live.

## Recurring 15-day trial authorization

1. In Razorpay, create a **monthly subscription plan** for **USD 20.00**, interval **1 month**. Confirm Razorpay supports the currency and recurring mandate for the countries/cards you will serve.
2. Configure `RAZORPAY_PLAN_ID=plan_...` alongside your Razorpay API key, secret and webhook secret. The app validates the plan's live amount, currency, and interval before starting checkout.
3. Enable verified subscription webhook events (`subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, `subscription.completed`) at `/webhooks/razorpay`. Subscription state is persisted on the server; do not edit the browser's state to activate an account.
4. Registration starts the 15-day trial immediately. In Workspace → Settings, the customer **explicitly authorizes** a recurring mandate for the existing trial end date. Without authorization, the service **does not charge automatically**. An authorization is not a charge and does not upgrade the workspace immediately.
5. After the free trial, the provider charges the authorized subscription every month. In Workspace → Settings the customer can cancel the subscription. Account deletion first cancels the mandate or safely fails without deleting the account.
6. The `/api/billing/order`, `/api/billing/verify`, and simulated payment routes are disabled for customers. Never use test keys to collect real payments.

**Launch gate:** Configure the provider, test with sandbox subscription authorization and webhook deliveries, verify price/currency/renewal date, and test cancellation and charge failures. Until configured, the checkout returns an explicit unavailable error; **no live automatic billing is enabled by this GitHub change alone**. Note: the current trial remains accessible without a payment method; it is not an automatic enrollment into paid billing.
