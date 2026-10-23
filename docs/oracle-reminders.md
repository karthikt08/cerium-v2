# CERIUM V4: Oracle VM reminder deployment

The web app and separate reminder worker use one SQLite database. No Redis,
Docker, hosted queue, or student credits. Reminders only happen after an owner
explicitly approves a scheduled invoice reminder, confirms customer consent,
and configures live email delivery. Disabled is the default.

## Architecture
- Web: Node 22+, Express and SQLite.
- Worker: independent Node process, polls every 60 seconds, handles 3 due
  reminders sequentially. One systemd service per process.
- Queue: SQLite durability across restarts, tenant isolation, scheduled/sending/
  sent/skipped/cancelled/review statuses, indexed due times and opt-out suppression.
- Safety: paid/draft/deleted invoices, recipient changes, or expired plans stop
  delivery. Interrupted/ambiguous SMTP sends become Needs review; no blind retry.
- Emails contain recipient-scoped signed unsubscribe links. Keep SESSION_SECRET
  stable across web and worker or previous links will stop working.
- Only one scheduled reminder per invoice for this MVP.

## Provision later (Oracle Always Free)

1. Confirm the chosen VM shape is Always Free Eligible in your tenancy/home region.
   Arm Ampere A1 is preferred over the 1-GB AMD micro when available.
2. Install an Ubuntu ARM64 image and Node.js 22+. Install python3, make and g++
   if better-sqlite3 must be compiled on ARM64. Run npm ci directly on the VM.
   If ARM64 has no matching prebuilt better-sqlite3 binary after npm ci,
   install build-essential/python3 and rebuild only that trusted dependency:

       npm rebuild better-sqlite3 --ignore-scripts=false

3. Place the checked-out app under /opt/cerium/app and create a system user
   named cerium. Store SQLite at /var/lib/cerium/cerium.db on persistent disk.
   Give the cerium user access only to its own DB files.
4. Configure HTTPS reverse-proxy via Caddy. A real domain and DNS pointing to
   the VM are needed for public TLS. Restrict the instance firewall and OCI
   ingress to trusted SSH and HTTPS ports 80/443. Do not expose port 3000.
5. Copy the two templates from deploy/oracle into /etc/systemd/system/ and
   update the Caddyfile template with your own domain.
6. Create /etc/cerium/cerium.env with root-only permissions (chmod 600).
   Do not put actual passwords in GitHub or screenshots.

Example environment settings (fill real credentials privately on the VM):

    NODE_ENV=production
    PORT=3000
    HOST=127.0.0.1
    TRUST_PROXY=1
    BASE_URL=https://your-domain.example
    DATABASE_PATH=/var/lib/cerium/cerium.db
    SESSION_SECRET=<persistent-random-secret>
    GOOGLE_CLIENT_ID=<valid-google-oauth-client-id>
    GOOGLE_CLIENT_SECRET=<valid-google-oauth-client-secret>
    REMINDER_DELIVERY_MODE=disabled

Existing CERIUM production requirements also apply, including other auth,
billing, and webhook credentials where configured.

For actual Oracle Email Delivery, verify your account's approved sender,
DNS SPF/DKIM, sending limits, and costs. Only after provider testing set:

    REMINDER_DELIVERY_MODE=live
    REMINDER_SMTP_HOST=<region-specific-smtp-endpoint>
    REMINDER_SMTP_PORT=465
    REMINDER_SMTP_USER=<smtp-user>
    REMINDER_SMTP_PASSWORD=<smtp-secret>
    REMINDER_FROM=<approved-sender-email>

SMTP uses implicit TLS on port 465, never outbound port 25.

## Services

Install dependencies and start web:

    cd /opt/cerium/app
    npm ci --omit=dev
    sudo systemctl daemon-reload
    sudo systemctl enable --now cerium-web
    sudo journalctl -u cerium-web -f

Do NOT enable the worker until the approved SMTP sender and unsubscribe URL
work end to end. The web UI can schedule and display reminders without a worker.

    sudo systemctl enable --now cerium-reminders
    sudo journalctl -u cerium-reminders -f

One worker only per DB. Do not use multiple web/worker copies over a shared
SQLite file on a network drive.

## Local validation (never sends real mail)

    git switch feat/oracle-reminder-automation
    npm test
    npm start

Open http://localhost:3000/app.html#reminders, create a Sent invoice with a
positive total and customer email, explicitly approve a reminder, and confirm
that it appears in the queue. Delivery remains disabled by default.

## Before pilot launch

- Test the SMTP adapter against your own verified inbox, not a customer.
- Confirm unsubscribe, paid invoices, customer-email changes, expired trials
  and restart recovery. Tests inject a fake sender and need not use Oracle.
- Use the existing SQLite backup script (or SQLite online backup API), not
  a plain copy of a database while WAL is active. Keep off-VM copies.
- Check real OCI service limits; Always Free Email Delivery allowances can
  differ from actual newly created tenancy send limits.
- The CERIUM invoice Sent field is a bookkeeping status, not evidence an
  invoice was emailed. Only schedule reminders for invoices actually sent.
- All deliverability, bounces and sender-reputation monitoring needs real
  provider validation before production usage.
- No Oracle VM is being created by this PR.
