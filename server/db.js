// server/db.js
//
// SQLite Database Layer with WAL mode, foreign keys, secure delete, and complete
// data isolation across all user workspaces, authentication, sessions, and payments.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = (token) => createHash('sha256').update(token).digest('hex');

function pad(n) { return n < 10 ? '0' + n : String(n); }
function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayStr() { return toDateStr(new Date()); }

function parseDateStr(s) {
  const p = String(s || '').split('-').map(Number);
  return new Date(p[0] || 2026, (p[1] || 1) - 1, p[2] || 1);
}

function daysBetween(a, b) {
  return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);
}

function termsToDays(terms) {
  const m = /(\d+)/.exec(String(terms || ''));
  return m ? Number(m[1]) : 15;
}

function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function openDb(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  const db = new Database(file);
  if (file !== ':memory:') {
    try { fs.chmodSync(file, 0o600); } catch { /* Windows ignore */ }
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('secure_delete = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                      TEXT PRIMARY KEY,
      email                   TEXT NOT NULL UNIQUE,
      password_hash           TEXT,
      name                    TEXT NOT NULL,
      business_name           TEXT,
      trade                   TEXT,
      phone                   TEXT,
      location                TEXT,
      country                 TEXT DEFAULT 'US',
      currency                TEXT DEFAULT 'USD',
      google_sub              TEXT UNIQUE,
      google_place_url        TEXT,
      email_verified          INTEGER DEFAULT 0,
      verification_token      TEXT,
      verification_expires    INTEGER,
      reset_token             TEXT,
      reset_expires           INTEGER,
      plan                    TEXT DEFAULT 'trial',
      plan_status             TEXT DEFAULT 'trial',
      trial_started_at        TEXT NOT NULL,
      trial_days_total        INTEGER DEFAULT 15,
      subscription_id         TEXT,
      subscription_expires_at INTEGER,
      bank_connected          INTEGER DEFAULT 0,
      bank_name               TEXT,
      bank_last_synced        TEXT,
      created_at              INTEGER NOT NULL,
      updated_at              INTEGER NOT NULL,
      terms_version           TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS users_email ON users (email);
    CREATE INDEX IF NOT EXISTS users_google_sub ON users (google_sub);

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      google_sub TEXT,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS sessions_sub ON sessions (google_sub);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS leads (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      name           TEXT NOT NULL,
      phone          TEXT,
      email          TEXT,
      address        TEXT,
      source         TEXT,
      stage          TEXT DEFAULT 'New',
      value          REAL DEFAULT 0,
      next_follow_up TEXT,
      notes          TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS leads_user ON leads (user_id);

    CREATE TABLE IF NOT EXISTS follow_ups (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      lead_id      TEXT,
      contact_name TEXT NOT NULL,
      phone        TEXT,
      channel      TEXT DEFAULT 'Call',
      task         TEXT NOT NULL,
      due_date     TEXT NOT NULL,
      done         INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS follow_ups_user ON follow_ups (user_id);

    CREATE TABLE IF NOT EXISTS invoices (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL,
      customer_name    TEXT NOT NULL,
      customer_email   TEXT,
      customer_address TEXT,
      job_title        TEXT NOT NULL,
      issue_date       TEXT NOT NULL,
      terms            TEXT DEFAULT 'Net 15',
      due_date         TEXT NOT NULL,
      status           TEXT DEFAULT 'Sent',
      items_json       TEXT NOT NULL,
      total            REAL DEFAULT 0,
      notes            TEXT,
      paid_at          TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS invoices_user ON invoices (user_id);

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      date                 TEXT NOT NULL,
      description          TEXT NOT NULL,
      amount               REAL NOT NULL,
      type                 TEXT DEFAULT 'Deposit',
      status               TEXT DEFAULT 'unmatched',
      suggested_invoice_id TEXT,
      matched_invoice_id   TEXT,
      created_at           TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bank_tx_user ON bank_transactions (user_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      customer_name  TEXT NOT NULL,
      customer_phone TEXT,
      customer_email TEXT,
      job_title      TEXT,
      completed_date TEXT,
      status         TEXT DEFAULT 'Not Asked',
      last_sent_at   TEXT,
      rating         INTEGER,
      review_snippet TEXT,
      created_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reviews_user ON reviews (user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      category   TEXT NOT NULL,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      reply_to   TEXT,
      via        TEXT DEFAULT 'In-app',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_user ON messages (user_id);

    CREATE TABLE IF NOT EXISTS payments (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      google_sub          TEXT,
      razorpay_order_id   TEXT NOT NULL UNIQUE,
      razorpay_payment_id TEXT UNIQUE,
      amount              INTEGER NOT NULL,
      currency            TEXT NOT NULL,
      status              TEXT NOT NULL,
      created_at          TEXT NOT NULL,
      paid_at             TEXT
    );
    CREATE INDEX IF NOT EXISTS payments_user ON payments (user_id);
    CREATE INDEX IF NOT EXISTS payments_sub ON payments (google_sub);

    CREATE TABLE IF NOT EXISTS waitlist (
      id            TEXT PRIMARY KEY,
      google_sub    TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL,
      name          TEXT NOT NULL,
      business      TEXT,
      joined_at     TEXT NOT NULL,
      terms_version TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS waitlist_email ON waitlist (email);
  `);

  const q = {
    // Users
    insertUser: db.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, business_name, trade, phone, location,
        country, currency, google_sub, google_place_url, email_verified,
        verification_token, verification_expires, reset_token, reset_expires,
        plan, plan_status, trial_started_at, trial_days_total, created_at, updated_at, terms_version
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
    `),
    getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
    getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    getUserByGoogleSub: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    getUserByVerificationToken: db.prepare('SELECT * FROM users WHERE verification_token = ?'),
    getUserByResetToken: db.prepare('SELECT * FROM users WHERE reset_token = ?'),
    updateUser: db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        business_name = COALESCE(?, business_name),
        trade = COALESCE(?, trade),
        phone = COALESCE(?, phone),
        location = COALESCE(?, location),
        country = COALESCE(?, country),
        currency = COALESCE(?, currency),
        google_place_url = COALESCE(?, google_place_url),
        updated_at = ?
      WHERE id = ?
    `),
    setUserVerified: db.prepare(`
      UPDATE users SET
        email_verified = 1,
        verification_token = NULL,
        verification_expires = NULL,
        updated_at = ?
      WHERE id = ?
    `),
    setUserResetToken: db.prepare(`
      UPDATE users SET
        reset_token = ?,
        reset_expires = ?,
        updated_at = ?
      WHERE id = ?
    `),
    updatePassword: db.prepare(`
      UPDATE users SET
        password_hash = ?,
        reset_token = NULL,
        reset_expires = NULL,
        updated_at = ?
      WHERE id = ?
    `),
    setUserPlan: db.prepare(`
      UPDATE users SET
        plan = ?,
        plan_status = ?,
        subscription_id = ?,
        subscription_expires_at = ?,
        updated_at = ?
      WHERE id = ?
    `),
    setBankStatus: db.prepare(`
      UPDATE users SET
        bank_connected = ?,
        bank_name = ?,
        bank_last_synced = ?,
        updated_at = ?
      WHERE id = ?
    `),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),

    // Sessions
    insertSession: db.prepare(
      'INSERT INTO sessions (token_hash, user_id, google_sub, email, name, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteSessionsForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteSessionsForSub: db.prepare('DELETE FROM sessions WHERE google_sub = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),

    // Leads
    getLeads: db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC'),
    insertLead: db.prepare(`
      INSERT INTO leads (id, user_id, name, phone, email, address, source, stage, value, next_follow_up, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateLead: db.prepare(`
      UPDATE leads SET
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        source = COALESCE(?, source),
        stage = COALESCE(?, stage),
        value = COALESCE(?, value),
        next_follow_up = COALESCE(?, next_follow_up),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `),
    deleteLead: db.prepare('DELETE FROM leads WHERE id = ? AND user_id = ?'),

    // Follow-ups
    getFollowUps: db.prepare('SELECT * FROM follow_ups WHERE user_id = ? ORDER BY due_date ASC, created_at DESC'),
    insertFollowUp: db.prepare(`
      INSERT INTO follow_ups (id, user_id, lead_id, contact_name, phone, channel, task, due_date, done, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateFollowUp: db.prepare(`
      UPDATE follow_ups SET
        contact_name = COALESCE(?, contact_name),
        phone = COALESCE(?, phone),
        channel = COALESCE(?, channel),
        task = COALESCE(?, task),
        due_date = COALESCE(?, due_date)
      WHERE id = ? AND user_id = ?
    `),
    toggleFollowUp: db.prepare('UPDATE follow_ups SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END WHERE id = ? AND user_id = ?'),
    deleteFollowUp: db.prepare('DELETE FROM follow_ups WHERE id = ? AND user_id = ?'),

    // Invoices
    getInvoices: db.prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC'),
    getInvoice: db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?'),
    countInvoices: db.prepare('SELECT COUNT(*) AS count FROM invoices WHERE user_id = ?'),
    insertInvoice: db.prepare(`
      INSERT INTO invoices (id, user_id, customer_name, customer_email, customer_address, job_title, issue_date, terms, due_date, status, items_json, total, notes, paid_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateInvoice: db.prepare(`
      UPDATE invoices SET
        customer_name = COALESCE(?, customer_name),
        customer_email = COALESCE(?, customer_email),
        customer_address = COALESCE(?, customer_address),
        job_title = COALESCE(?, job_title),
        terms = COALESCE(?, terms),
        due_date = COALESCE(?, due_date),
        status = COALESCE(?, status),
        items_json = COALESCE(?, items_json),
        total = COALESCE(?, total),
        notes = COALESCE(?, notes),
        paid_at = ?
      WHERE id = ? AND user_id = ?
    `),
    updateInvoiceStatus: db.prepare('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ? AND user_id = ?'),
    deleteInvoice: db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?'),

    // Bank Transactions
    getBankTransactions: db.prepare('SELECT * FROM bank_transactions WHERE user_id = ? ORDER BY date DESC'),
    insertBankTx: db.prepare(`
      INSERT INTO bank_transactions (id, user_id, date, description, amount, type, status, suggested_invoice_id, matched_invoice_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    resolveBankMatch: db.prepare(`
      UPDATE bank_transactions SET
        status = ?,
        suggested_invoice_id = COALESCE(?, suggested_invoice_id),
        matched_invoice_id = COALESCE(?, matched_invoice_id)
      WHERE id = ? AND user_id = ?
    `),

    // Reviews
    getReviews: db.prepare('SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC'),
    insertReview: db.prepare(`
      INSERT INTO reviews (id, user_id, customer_name, customer_phone, customer_email, job_title, completed_date, status, last_sent_at, rating, review_snippet, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateReview: db.prepare(`
      UPDATE reviews SET
        customer_name = COALESCE(?, customer_name),
        customer_phone = COALESCE(?, customer_phone),
        customer_email = COALESCE(?, customer_email),
        job_title = COALESCE(?, job_title)
      WHERE id = ? AND user_id = ?
    `),
    sendReview: db.prepare('UPDATE reviews SET status = ?, last_sent_at = ? WHERE id = ? AND user_id = ?'),
    completeReview: db.prepare("UPDATE reviews SET status = 'Reviewed', rating = 5 WHERE id = ? AND user_id = ?"),
    deleteReview: db.prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?'),

    // Messages
    getMessages: db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC'),
    insertMessage: db.prepare(`
      INSERT INTO messages (id, user_id, category, subject, body, reply_to, via, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteMessage: db.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?'),

    // Clear workspace data
    clearLeads: db.prepare('DELETE FROM leads WHERE user_id = ?'),
    clearFollowUps: db.prepare('DELETE FROM follow_ups WHERE user_id = ?'),
    clearInvoices: db.prepare('DELETE FROM invoices WHERE user_id = ?'),
    clearBankTx: db.prepare('DELETE FROM bank_transactions WHERE user_id = ?'),
    clearReviews: db.prepare('DELETE FROM reviews WHERE user_id = ?'),
    clearMessages: db.prepare('DELETE FROM messages WHERE user_id = ?'),

    // Payments
    insertPayment: db.prepare(`
      INSERT OR REPLACE INTO payments (id, user_id, google_sub, razorpay_order_id, razorpay_payment_id, amount, currency, status, created_at, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPaymentByOrder: db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?'),
    markPaymentPaid: db.prepare("UPDATE payments SET status = 'paid', razorpay_payment_id = ?, paid_at = ? WHERE razorpay_order_id = ?"),
    markPaymentFailed: db.prepare("UPDATE payments SET status = 'failed' WHERE razorpay_order_id = ?"),

    // Waitlist & legacy
    getMember: db.prepare('SELECT * FROM waitlist WHERE google_sub = ?'),
    insertMember: db.prepare(
      'INSERT OR IGNORE INTO waitlist (id, google_sub, email, name, business, joined_at, terms_version) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    refreshMember: db.prepare('UPDATE waitlist SET email = ?, name = ? WHERE google_sub = ?'),
    setBusiness: db.prepare('UPDATE waitlist SET business = ? WHERE google_sub = ?'),
    deleteMember: db.prepare('DELETE FROM waitlist WHERE google_sub = ?'),
    allMembers: db.prepare('SELECT email, name, business, joined_at FROM waitlist ORDER BY joined_at ASC'),
    countWaitlist: db.prepare('SELECT COUNT(*) AS n FROM waitlist'),
    ping: db.prepare('SELECT 1 AS ok'),
  };

  const memberOut = (row) =>
    row && { email: row.email, name: row.name, business: row.business || '', joinedAt: row.joined_at, termsVersion: row.terms_version };

  return {
    rawDb: db,

    // ---------------------------------------------------------------- Sessions
    createSession({ userId, sub = '', email, name, ttlMs, now = Date.now() }) {
      // Ensure user exists if only sub/email passed
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        let u = sub ? q.getUserByGoogleSub.get(sub) : q.getUserByEmail.get(email.toLowerCase());
        if (!u) {
          const newId = randomUUID();
          q.insertUser.run(
            newId,
            email.toLowerCase(),
            null,
            name,
            null, null, null, null,
            'US', 'USD',
            sub || null, null,
            1, null, null, null, null,
            'trial', 'trial',
            todayStr(), 15,
            now, now, '2026-10-19'
          );
          resolvedUserId = newId;
        } else {
          resolvedUserId = u.id;
        }
      }

      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(24).toString('base64url');
      const expiresAt = now + ttlMs;
      q.insertSession.run(hash(token), resolvedUserId, sub || null, email, name, csrfToken, now, expiresAt);
      return { token, csrfToken, expiresAt, userId: resolvedUserId };
    },

    getSession(token, now = Date.now()) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
      const row = q.getSession.get(hash(token));
      if (!row) return null;
      if (row.expires_at <= now) {
        q.deleteSession.run(row.token_hash);
        return null;
      }
      return {
        userId: row.user_id,
        sub: row.google_sub || '',
        email: row.email,
        name: row.name,
        csrfToken: row.csrf_token,
        expiresAt: row.expires_at,
      };
    },

    deleteSession(token) {
      if (typeof token === 'string' && token) q.deleteSession.run(hash(token));
    },

    deleteSessionsForUser(userId) {
      q.deleteSessionsForUser.run(userId);
    },

    purgeExpiredSessions(now = Date.now()) {
      return q.purgeSessions.run(now).changes;
    },

    // ---------------------------------------------------------------- Users
    createUser({ email, passwordHash = null, name, businessName = '', termsVersion = '2026-10-19', googleSub = null, emailVerified = 0, verificationToken = null, verificationExpires = null, now = Date.now() }) {
      const id = randomUUID();
      const cleanEmail = email.trim().toLowerCase();
      q.insertUser.run(
        id,
        cleanEmail,
        passwordHash,
        name.trim(),
        businessName ? businessName.trim() : null,
        null, null, null,
        'US', 'USD',
        googleSub || null, null,
        emailVerified ? 1 : 0,
        verificationToken, verificationExpires,
        null, null,
        'trial', 'trial',
        todayStr(), 15,
        now, now, termsVersion
      );
      return q.getUserById.get(id);
    },

    getUserById(id) {
      return q.getUserById.get(id) || null;
    },

    getUserByEmail(email) {
      return q.getUserByEmail.get(String(email).trim().toLowerCase()) || null;
    },

    getUserByGoogleSub(sub) {
      return q.getUserByGoogleSub.get(sub) || null;
    },

    getUserByVerificationToken(token) {
      return q.getUserByVerificationToken.get(token) || null;
    },

    getUserByResetToken(token) {
      return q.getUserByResetToken.get(token) || null;
    },

    updateUser(id, { name, businessName, trade, phone, location, country, currency, googlePlaceUrl }) {
      const now = Date.now();
      q.updateUser.run(
        name !== undefined ? name.trim() : null,
        businessName !== undefined ? businessName.trim() : null,
        trade !== undefined ? trade.trim() : null,
        phone !== undefined ? phone.trim() : null,
        location !== undefined ? location.trim() : null,
        country !== undefined ? country.trim() : null,
        currency !== undefined ? currency.trim() : null,
        googlePlaceUrl !== undefined ? googlePlaceUrl.trim() : null,
        now, id
      );
      return q.getUserById.get(id);
    },

    verifyUserEmail(id) {
      q.setUserVerified.run(Date.now(), id);
    },

    setResetToken(id, token, expiresAt) {
      q.setUserResetToken.run(token, expiresAt, Date.now(), id);
    },

    resetPassword(id, newPasswordHash) {
      const run = db.transaction(() => {
        q.updatePassword.run(newPasswordHash, Date.now(), id);
        q.deleteSessionsForUser.run(id);
      });
      run();
    },

    setUserPlan(id, { plan, planStatus, subscriptionId = null, expiresAt = null }) {
      q.setUserPlan.run(plan, planStatus, subscriptionId, expiresAt, Date.now(), id);
      return q.getUserById.get(id);
    },

    setBankStatus(id, { connected, bankName, lastSynced }) {
      q.setBankStatus.run(connected ? 1 : 0, bankName || null, lastSynced || null, Date.now(), id);
      return q.getUserById.get(id);
    },

    // ---------------------------------------------------------------- Workspace Data & Entitlements
    getWorkspace(userId) {
      const user = q.getUserById.get(userId);
      if (!user) return null;

      const today = todayStr();
      const usedDays = Math.max(0, daysBetween(user.trial_started_at || today, today));
      const trialDaysTotal = user.trial_days_total || 15;
      const trialDaysRemaining = Math.max(0, trialDaysTotal - usedDays);

      let effectivePlanStatus = user.plan_status;
      if (effectivePlanStatus === 'active') {
        if (user.subscription_expires_at && user.subscription_expires_at < Date.now()) {
          effectivePlanStatus = 'expired';
          q.setUserPlan.run('expired', 'expired', user.subscription_id, user.subscription_expires_at, Date.now(), userId);
        }
      } else if (effectivePlanStatus === 'trial' && trialDaysRemaining <= 0) {
        effectivePlanStatus = 'expired';
      }

      // Fetch user's data items
      const rawLeads = q.getLeads.all(userId);
      const rawFollowUps = q.getFollowUps.all(userId);
      const rawInvoices = q.getInvoices.all(userId);
      const rawBankTx = q.getBankTransactions.all(userId);
      const rawReviews = q.getReviews.all(userId);
      const rawMessages = q.getMessages.all(userId);

      const leads = rawLeads.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone || '',
        email: l.email || '',
        address: l.address || '',
        source: l.source || 'Direct Inquiry',
        stage: l.stage || 'New',
        value: Number(l.value) || 0,
        nextFollowUp: l.next_follow_up || '',
        notes: l.notes || '',
        createdAt: l.created_at,
      }));

      const followUps = rawFollowUps.map((f) => ({
        id: f.id,
        leadId: f.lead_id || null,
        contactName: f.contact_name,
        phone: f.phone || '',
        channel: f.channel || 'Call',
        task: f.task,
        dueDate: f.due_date,
        done: Boolean(f.done),
      }));

      const invoices = rawInvoices.map((i) => {
        let items = [];
        try { items = JSON.parse(i.items_json); } catch { items = []; }
        let status = i.status;
        if (status === 'Sent' && i.due_date && i.due_date < today) status = 'Overdue';
        return {
          id: i.id,
          customerName: i.customer_name,
          customerEmail: i.customer_email || '',
          customerAddress: i.customer_address || '',
          jobTitle: i.job_title,
          issueDate: i.issue_date,
          terms: i.terms || 'Net 15',
          dueDate: i.due_date,
          status,
          items,
          total: Number(i.total) || 0,
          notes: i.notes || '',
          paidAt: i.paid_at || undefined,
        };
      });

      const bankTransactions = rawBankTx.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: Number(t.amount),
        type: t.type || 'Deposit',
        status: t.status,
        suggestedInvoiceId: t.suggested_invoice_id || undefined,
        matchedInvoiceId: t.matched_invoice_id || undefined,
      }));

      const reviews = rawReviews.map((r) => ({
        id: r.id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone || '',
        customerEmail: r.customer_email || '',
        jobTitle: r.job_title || '',
        completedDate: r.completed_date || today,
        status: r.status,
        lastSentAt: r.last_sent_at || null,
        rating: r.rating || null,
        reviewSnippet: r.review_snippet || '',
      }));

      const messages = rawMessages.map((m) => ({
        id: m.id,
        category: m.category,
        subject: m.subject,
        body: m.body,
        replyTo: m.reply_to || '',
        via: m.via || 'In-app',
        createdAt: m.created_at,
      }));

      return {
        account: {
          id: user.id,
          name: user.name,
          businessName: user.business_name || '',
          trade: user.trade || '',
          email: user.email,
          phone: user.phone || '',
          location: user.location || '',
          country: user.country || 'US',
          currency: user.currency || 'USD',
          googlePlaceUrl: user.google_place_url || '',
          trialStartedAt: user.trial_started_at,
          trialDaysTotal: trialDaysTotal,
          trialDaysRemaining: trialDaysRemaining,
          planStatus: effectivePlanStatus,
          monthlyPrice: 20,
          bankConnected: Boolean(user.bank_connected),
          bankName: user.bank_name || '',
          bankLastSynced: user.bank_last_synced || '',
        },
        leads,
        followUps,
        invoices,
        bankTransactions,
        reviews,
        messages,
      };
    },

    createLead(userId, payload) {
      const today = todayStr();
      const id = 'LD-' + randomBytes(4).toString('hex');
      const lead = {
        id,
        name: (payload.name || '').trim(),
        phone: (payload.phone || '').trim(),
        email: (payload.email || '').trim(),
        address: (payload.address || '').trim(),
        source: payload.source || 'Direct',
        stage: payload.stage || 'New',
        value: Number(payload.value) || 0,
        nextFollowUp: payload.nextFollowUp || today,
        notes: (payload.notes || '').trim(),
        createdAt: today,
      };
      q.insertLead.run(lead.id, userId, lead.name, lead.phone, lead.email, lead.address, lead.source, lead.stage, lead.value, lead.nextFollowUp, lead.notes, today, today);

      if (payload.createReminder !== false && lead.nextFollowUp) {
        const fuId = 'FU-' + randomBytes(4).toString('hex');
        q.insertFollowUp.run(
          fuId, userId, lead.id, lead.name, lead.phone, 'Call',
          lead.notes ? ('Follow up: ' + lead.notes.slice(0, 70)) : ('Follow up on ' + lead.source + ' inquiry'),
          lead.nextFollowUp, 0, today
        );
      }
      if (lead.stage === 'Done') {
        const revId = 'RV-' + randomBytes(4).toString('hex');
        q.insertReview.run(revId, userId, lead.name, lead.phone, lead.email, lead.notes || 'Completed Service Job', today, 'Not Asked', null, null, '', today);
      }
      return lead;
    },

    updateLead(userId, leadId, updates) {
      const now = todayStr();
      q.updateLead.run(
        updates.name, updates.phone, updates.email, updates.address, updates.source,
        updates.stage, updates.value, updates.nextFollowUp, updates.notes,
        now, leadId, userId
      );
      if (updates.stage === 'Done' && updates.name) {
        const revId = 'RV-' + randomBytes(4).toString('hex');
        q.insertReview.run(revId, userId, updates.name, updates.phone || null, updates.email || null, updates.notes || 'Completed Service Job', now, 'Not Asked', null, null, '', now);
      }
      return { ok: true };
    },

    deleteLead(userId, leadId) {
      q.deleteLead.run(leadId, userId);
      return { ok: true };
    },

    createFollowUp(userId, payload) {
      const id = 'FU-' + randomBytes(4).toString('hex');
      const fu = {
        id,
        leadId: payload.leadId || null,
        contactName: (payload.contactName || '').trim(),
        phone: (payload.phone || '').trim(),
        channel: payload.channel || 'Call',
        task: (payload.task || '').trim(),
        dueDate: payload.dueDate || todayStr(),
        done: false,
      };
      q.insertFollowUp.run(fu.id, userId, fu.leadId, fu.contactName, fu.phone, fu.channel, fu.task, fu.dueDate, 0, todayStr());
      return fu;
    },

    updateFollowUp(userId, id, updates) {
      q.updateFollowUp.run(updates.contactName, updates.phone, updates.channel, updates.task, updates.dueDate, id, userId);
      return { ok: true };
    },

    toggleFollowUp(userId, id) {
      q.toggleFollowUp.run(id, userId);
      return { ok: true };
    },

    deleteFollowUp(userId, id) {
      q.deleteFollowUp.run(id, userId);
      return { ok: true };
    },

    createInvoice(userId, payload) {
      const today = todayStr();
      const terms = payload.terms || 'Net 15';
      const items = payload.items && payload.items.length ? payload.items : [
        { description: payload.jobTitle || 'Service labor & materials', qty: 1, rate: Number(payload.amount) || 0 },
      ];
      const total = items.reduce((s, it) => s + (Number(it.qty) || 1) * (Number(it.rate) || 0), 0);
      const count = q.countInvoices.get(userId).count;
      const id = String(1001 + count);
      const inv = {
        id,
        customerName: (payload.customerName || '').trim(),
        customerEmail: (payload.customerEmail || '').trim(),
        customerAddress: (payload.customerAddress || '').trim(),
        jobTitle: (payload.jobTitle || '').trim(),
        issueDate: payload.issueDate || today,
        terms,
        dueDate: payload.dueDate || addDays(today, termsToDays(terms)),
        status: payload.status || 'Sent',
        items,
        total,
        notes: (payload.notes || 'Thank you for your business!').trim(),
        paidAt: payload.status === 'Paid' ? today : null,
      };
      q.insertInvoice.run(
        inv.id, userId, inv.customerName, inv.customerEmail, inv.customerAddress,
        inv.jobTitle, inv.issueDate, inv.terms, inv.dueDate, inv.status,
        JSON.stringify(inv.items), inv.total, inv.notes, inv.paidAt, today
      );
      return inv;
    },

    updateInvoice(userId, id, p) {
      const inv = q.getInvoice.get(String(id), userId);
      if (!inv) throw new Error('Invoice not found');
      let items = [];
      try { items = JSON.parse(inv.items_json); } catch { items = []; }
      if (p.amount !== undefined && p.amount !== null && p.amount !== '' && items.length <= 1) {
        items = [{ description: p.jobTitle || inv.job_title || 'Service labor & materials', qty: 1, rate: Number(p.amount) || 0 }];
      } else if (p.items) {
        items = p.items;
      }
      const total = items.reduce((s, it) => s + (Number(it.qty) || 1) * (Number(it.rate) || 0), 0);
      const terms = p.terms || inv.terms;
      const dueDate = p.dueDate || (p.terms ? addDays(inv.issue_date || todayStr(), termsToDays(terms)) : inv.due_date);
      const status = p.status || inv.status;
      const paidAt = status === 'Paid' ? (inv.paid_at || todayStr()) : null;

      q.updateInvoice.run(
        p.customerName, p.customerEmail, p.customerAddress, p.jobTitle,
        terms, dueDate, status, JSON.stringify(items), total, p.notes,
        paidAt, String(id), userId
      );
      return { ok: true };
    },

    updateInvoiceStatus(userId, id, status) {
      const paidAt = status === 'Paid' ? todayStr() : null;
      q.updateInvoiceStatus.run(status, paidAt, String(id), userId);
      return { ok: true };
    },

    deleteInvoice(userId, id) {
      q.deleteInvoice.run(String(id), userId);
      return { ok: true };
    },

    resolveBankMatch(userId, txId, action, targetInvoiceId) {
      if (action === 'confirm') {
        q.resolveBankMatch.run('matched', targetInvoiceId || null, targetInvoiceId || null, txId, userId);
        if (targetInvoiceId) {
          q.updateInvoiceStatus.run('Paid', todayStr(), String(targetInvoiceId), userId);
        }
      } else {
        q.resolveBankMatch.run('dismissed', null, null, txId, userId);
      }
      return { ok: true };
    },

    syncBankFeed(userId) {
      const user = q.getUserById.get(userId);
      if (!user || !user.bank_connected) return { connected: false, newCount: 0 };
      q.setBankStatus.run(1, user.bank_name || 'Connected Bank', 'Just now', Date.now(), userId);
      return { connected: true, newCount: 0 };
    },

    createReview(userId, payload) {
      const id = 'RV-' + randomBytes(4).toString('hex');
      const today = todayStr();
      q.insertReview.run(
        id, userId, (payload.customerName || '').trim(), (payload.customerPhone || '').trim(),
        (payload.customerEmail || '').trim(), (payload.jobTitle || '').trim(),
        today, 'Sent', today, null, '', today
      );
      return { id };
    },

    sendReviewRequest(userId, id) {
      q.sendReview.run('Sent', todayStr(), id, userId);
      return { ok: true };
    },

    completeReview(userId, id) {
      q.completeReview.run(id, userId);
      return { ok: true };
    },

    deleteReview(userId, id) {
      q.deleteReview.run(id, userId);
      return { ok: true };
    },

    createMessage(userId, payload) {
      const id = 'MSG-' + randomBytes(4).toString('hex');
      q.insertMessage.run(
        id, userId, payload.category || 'Question', (payload.subject || '').trim(),
        (payload.body || '').trim(), (payload.replyTo || '').trim(), payload.via || 'In-app',
        new Date().toISOString()
      );
      return { id };
    },

    deleteMessage(userId, id) {
      q.deleteMessage.run(id, userId);
      return { ok: true };
    },

    clearWorkspaceData(userId) {
      const run = db.transaction(() => {
        q.clearLeads.run(userId);
        q.clearFollowUps.run(userId);
        q.clearInvoices.run(userId);
        q.clearBankTx.run(userId);
        q.clearReviews.run(userId);
        q.clearMessages.run(userId);
      });
      run();
      return { ok: true };
    },

    // ---------------------------------------------------------------- Payments & Billing
    insertPayment({ userId, sub = null, orderId, amount, currency }) {
      const id = 'pay_' + randomBytes(8).toString('hex');
      q.insertPayment.run(id, userId, sub, orderId, null, amount, currency, 'created', new Date().toISOString(), null);
      return { id, orderId };
    },

    getPaymentByOrder(orderId) {
      const row = q.getPaymentByOrder.get(orderId);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        googleSub: row.google_sub,
        razorpayOrderId: row.razorpay_order_id,
        razorpayPaymentId: row.razorpay_payment_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      };
    },

    markPaid({ orderId, paymentId, amount, currency }) {
      const row = q.getPaymentByOrder.get(orderId);
      if (!row) return null;
      const now = new Date().toISOString();
      const run = db.transaction(() => {
        q.markPaymentPaid.run(paymentId, now, orderId);
        // Grant 30 days active Pro subscription
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
        q.setUserPlan.run('pro', 'active', orderId, expiresAt, Date.now(), row.user_id);
      });
      run();
      return true;
    },

    markPaymentFailed(orderId) {
      q.markPaymentFailed.run(orderId);
    },

    // ---------------------------------------------------------------- Waitlist & Legacy
    getMember(sub) {
      return memberOut(q.getMember.get(sub)) || null;
    },

    joinWaitlist({ sub, email, name, business = '', termsVersion, now = new Date() }) {
      const info = q.insertMember.run(randomUUID(), sub, email, name, business || null, now.toISOString(), termsVersion);
      if (info.changes === 0) {
        q.refreshMember.run(email, name, sub);
        const current = q.getMember.get(sub);
        if (business && !current.business) q.setBusiness.run(business, sub);
      }
      return { created: info.changes === 1 };
    },

    refreshMember({ sub, email, name }) {
      q.refreshMember.run(email, name, sub);
    },

    deleteAccount(subOrUserId) {
      const run = db.transaction(() => {
        let u = q.getUserByGoogleSub.get(subOrUserId) || q.getUserById.get(subOrUserId);
        const userId = u ? u.id : subOrUserId;
        const sub = u && u.google_sub ? u.google_sub : subOrUserId;

        q.clearLeads.run(userId);
        q.clearFollowUps.run(userId);
        q.clearInvoices.run(userId);
        q.clearBankTx.run(userId);
        q.clearReviews.run(userId);
        q.clearMessages.run(userId);

        const member = q.deleteMember.run(sub).changes;
        const sessions = q.deleteSessionsForUser.run(userId).changes + (sub ? q.deleteSessionsForSub.run(sub).changes : 0);
        q.deleteUser.run(userId);

        return { removedMember: member > 0, removedSessions: sessions };
      });
      const result = run();
      try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
      return result;
    },

    listForExport() {
      const seen = new Set();
      const out = [];
      for (const row of q.allMembers.all()) {
        const key = row.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ email: row.email, name: row.name, business: row.business || '', joinedAt: row.joined_at });
      }
      return out;
    },

    count() {
      return q.countWaitlist.get().n;
    },

    ping() {
      return q.ping.get().ok === 1;
    },

    close() {
      db.close();
    },
  };
}
