// server/db.js
//
// SQLite Database Layer with WAL mode, foreign keys, secure delete, and complete
// data isolation across all user workspaces, authentication, sessions, and payments.

import Database from 'better-sqlite3';
import { createJobsStore } from './jobs.js';
import { createReminderStore } from './reminders.js';
import { createQuotesStore } from './quotes.js';
import { validUsState, validUsZip, validUsTimeZone, businessLocalDate } from '../public/js/us-market.js';
import { validIndianState,validGSTIN,validUpiVpa,gstBreakdown,safeGSTrate } from '../public/js/india-market.js';
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
  if (terms === 'Due on receipt') return 0;
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
    -- A durable sequence keeps invoice identifiers unique across workspaces and deletions.
    CREATE TABLE IF NOT EXISTS invoice_numbers (id INTEGER PRIMARY KEY AUTOINCREMENT);
    INSERT OR IGNORE INTO invoice_numbers (id)
      SELECT MAX(1000, COALESCE(MAX(CAST(id AS INTEGER)), 0)) FROM invoices;

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

  // Subscription records are persisted separately from one-time legacy payments.
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_subscriptions (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      start_at INTEGER NOT NULL,
      current_end INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS recurring_subscriptions_user ON recurring_subscriptions(user_id);
  `);
  // Non-destructive US profile migration. Preserve all historical invoices and currency.
  const userColumns=new Set(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
  for(const [column,ddl] of [
    ['us_state',"ALTER TABLE users ADD COLUMN us_state TEXT NOT NULL DEFAULT ''"],
    ['us_zip',"ALTER TABLE users ADD COLUMN us_zip TEXT NOT NULL DEFAULT ''"],
    ['time_zone',"ALTER TABLE users ADD COLUMN time_zone TEXT NOT NULL DEFAULT ''"],
  ])if(!userColumns.has(column))db.exec(ddl);


  // India edition is opt-in per clean workspace: no existing USD records get
  // converted. Snapshot the currency and GST amounts for each created invoice.
  for (const [col,ddl] of [
    ['india_state',"ALTER TABLE users ADD COLUMN india_state TEXT NOT NULL DEFAULT ''"],
    ['gstin',"ALTER TABLE users ADD COLUMN gstin TEXT NOT NULL DEFAULT ''"],
    ['upi_vpa',"ALTER TABLE users ADD COLUMN upi_vpa TEXT NOT NULL DEFAULT ''"],
  ]) if(!userColumns.has(col))db.exec(ddl);
  const editionInvoices=new Set(db.prepare('PRAGMA table_info(invoices)').all().map(c=>c.name));
  for(const [col,ddl] of [
    ['invoice_currency',"ALTER TABLE invoices ADD COLUMN invoice_currency TEXT"],
    ['supplier_gstin',"ALTER TABLE invoices ADD COLUMN supplier_gstin TEXT NOT NULL DEFAULT ''"],
    ['supplier_state',"ALTER TABLE invoices ADD COLUMN supplier_state TEXT NOT NULL DEFAULT ''"],
    ['customer_gstin',"ALTER TABLE invoices ADD COLUMN customer_gstin TEXT NOT NULL DEFAULT ''"],
    ['place_of_supply',"ALTER TABLE invoices ADD COLUMN place_of_supply TEXT NOT NULL DEFAULT ''"],
    ['hsn_sac',"ALTER TABLE invoices ADD COLUMN hsn_sac TEXT NOT NULL DEFAULT ''"],
    ['gst_rate',"ALTER TABLE invoices ADD COLUMN gst_rate REAL NOT NULL DEFAULT 0"],
    ['taxable_total',"ALTER TABLE invoices ADD COLUMN taxable_total REAL NOT NULL DEFAULT 0"],
    ['cgst',"ALTER TABLE invoices ADD COLUMN cgst REAL NOT NULL DEFAULT 0"],
    ['sgst',"ALTER TABLE invoices ADD COLUMN sgst REAL NOT NULL DEFAULT 0"],
    ['utgst',"ALTER TABLE invoices ADD COLUMN utgst REAL NOT NULL DEFAULT 0"],
    ['igst',"ALTER TABLE invoices ADD COLUMN igst REAL NOT NULL DEFAULT 0"],
    ['upi_vpa_snapshot',"ALTER TABLE invoices ADD COLUMN upi_vpa_snapshot TEXT NOT NULL DEFAULT ''"],
  ])if(!editionInvoices.has(col))db.exec(ddl);
  // Historical amounts are *labeled*, never converted. Existing INR/USD
  // invoices pick up their saved owner's original currency.
  db.exec("UPDATE invoices SET invoice_currency=COALESCE((SELECT currency FROM users WHERE users.id=invoices.user_id),'USD') WHERE invoice_currency IS NULL");
  // Existing invoices retain their numbers and data. A nullable source job ID
  // lets one automatically generated invoice be linked to its origin.
  const invoiceColumns = new Set(db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name));
  if (!invoiceColumns.has('job_id')) db.exec('ALTER TABLE invoices ADD COLUMN job_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS invoices_source_job ON invoices(user_id, job_id) WHERE job_id IS NOT NULL');
  const jobsStore = createJobsStore(db, {onCompleted: generateJobDraft});
  const reminders = createReminderStore(db);
  const quotesStore = createQuotesStore(db,{jobsStore});
  // One-time, non-destructive currency cleanup for empty legacy test workspaces.
  // Never touch an account containing financial history or priced work; those
  // records were originally created under its saved currency.
  db.prepare(`
    UPDATE users SET currency='USD', updated_at=?
    WHERE currency='INR' AND COALESCE(country,'US')='US'
      AND NOT EXISTS (SELECT 1 FROM invoices WHERE invoices.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM quotes WHERE quotes.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM jobs WHERE jobs.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM bank_transactions WHERE bank_transactions.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM payments WHERE payments.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM recurring_subscriptions WHERE recurring_subscriptions.user_id=users.id)
      AND NOT EXISTS (SELECT 1 FROM leads WHERE leads.user_id=users.id AND COALESCE(leads.value,0)<>0)
  `).run(Date.now());
  const subscriptionFind = db.prepare('SELECT * FROM recurring_subscriptions WHERE subscription_id = ?');
  const subscriptionForUser = db.prepare('SELECT * FROM recurring_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
  const subscriptionInsert = db.prepare('INSERT INTO recurring_subscriptions (subscription_id,user_id,status,start_at,created_at) VALUES (?,?,?,?,?)');
  const subscriptionUpdate = db.prepare('UPDATE recurring_subscriptions SET status=?,current_end=? WHERE subscription_id=?');

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
        us_state = COALESCE(?, us_state),
        us_zip = COALESCE(?, us_zip),
        time_zone = COALESCE(?, time_zone),
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
    updateIndiaProfile: db.prepare('UPDATE users SET india_state=?,gstin=?,upi_vpa=? WHERE id=?'),
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
    getLeads: db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC, rowid DESC'),
    getLead: db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?'),
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
    getInvoiceForJob: db.prepare('SELECT id FROM invoices WHERE user_id = ? AND job_id = ?'),
    linkInvoiceToJob: db.prepare('UPDATE invoices SET job_id = ? WHERE id = ? AND user_id = ?'),
    nextInvoiceNumber: db.prepare('INSERT INTO invoice_numbers DEFAULT VALUES'),
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
    setInvoiceCurrency: db.prepare('UPDATE invoices SET invoice_currency=? WHERE id=? AND user_id=?'),
    setIndiaInvoiceTax: db.prepare(`UPDATE invoices SET invoice_currency=?,supplier_gstin=?,supplier_state=?,customer_gstin=?,
       place_of_supply=?,hsn_sac=?,gst_rate=?,taxable_total=?,cgst=?,sgst=?,utgst=?,igst=?,upi_vpa_snapshot=?
       WHERE id=? AND user_id=?`),
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
    completeReview: db.prepare("UPDATE reviews SET status = 'Reviewed' WHERE id = ? AND user_id = ?"),
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

  // Business-facing days follow the US service location, not the Oracle VM clock.
  // Keep trial/billing timestamps in their existing UTC semantics.
  const userBusinessToday=userId=>{const u=q.getUserById.get(userId);return businessLocalDate(u?.country==='IN'?'Asia/Kolkata':u?.time_zone);};
  const pricedHistory=userId=>['invoices','quotes','jobs','bank_transactions','payments','recurring_subscriptions','leads','follow_ups'].some(
    table=>Boolean(db.prepare('SELECT 1 FROM '+table+' WHERE user_id=? LIMIT 1').get(userId))
  );
  const editionTax=(user,items,p={})=>{
    if(user.country!=='IN')return null;
    const base=Math.round(items.reduce((sum,i)=>sum+Number(i.qty)*Number(i.rate),0)*100)/100;
    const gstin=user.gstin||'';
    const gstRate=p.gstRate===undefined?0:Number(p.gstRate);
    const place=p.placeOfSupply||user.india_state||'';
    const customerGSTIN=(p.customerGstin||'').trim().toUpperCase();
    const hsn=(p.hsnSac||'').trim();
    if(!validGSTIN(customerGSTIN)||!validGSTIN(gstin))throw Object.assign(new Error('Check GSTIN format.'),{code:'invalid_gst_invoice',status:400});
    if(gstin&&(!user.india_state||gstin.slice(0,2)!==user.india_state||!validIndianState(place)||
       !place||!hsn||!/^[0-9]{4,8}$/.test(hsn)||!safeGSTrate(gstRate)))
      throw Object.assign(new Error('GST invoices need supplier state, place of supply, numeric HSN/SAC and a valid GST rate.'),{code:'invalid_gst_invoice',status:400});
    if(!gstin&&(gstRate||customerGSTIN||hsn))
      throw Object.assign(new Error('Add your business GSTIN in Settings before charging GST.'),{code:'invalid_gst_invoice',status:400});
    const tax=gstin?gstBreakdown(base,gstRate,user.india_state,place):{taxable:base,gstRate:0,cgst:0,sgst:0,utgst:0,igst:0,total:base};
    return {currency:'INR',supplierGstin:gstin,supplierState:user.india_state||'',customerGstin:customerGSTIN,
      placeOfSupply:gstin?place:'',hsnSac:hsn,...tax,upiVpa:user.upi_vpa||''};
  };
  const persistInvoiceTax=(userId,id,tax)=>{
    if(!tax)return q.setInvoiceCurrency.run('USD',id,userId);
    q.setIndiaInvoiceTax.run(tax.currency,tax.supplierGstin,tax.supplierState,tax.customerGstin,
      tax.placeOfSupply,tax.hsnSac,tax.gstRate,tax.taxable,tax.cgst,tax.sgst,tax.utgst,tax.igst,tax.upiVpa,id,userId);
  };

  // Called inside the Jobs SQLite transaction, only when a job first becomes
  // Completed. Either job completion and invoice draft both commit, or neither.
  // The unique index is a second defense against duplicate draft invoices.
  function generateJobDraft(userId, job) {
    if (q.getInvoiceForJob.get(userId, job.id)) return;
    const today = userBusinessToday(userId);
    const items = job.billableItems.length
      ? job.billableItems
      : [{description: job.title, qty: 1, rate: 0}];
    const total = Math.round(items.reduce((sum, item) => sum + item.qty * item.rate, 0) * 100) / 100;
    const invoiceId = String(q.nextInvoiceNumber.run().lastInsertRowid);
    const notes = 'Draft generated from completed job. Review items and pricing before sending.';
    const linkedLead = job.leadId ? q.getLead.get(job.leadId, userId) : null;
    q.insertInvoice.run(invoiceId, userId, job.customerName, linkedLead?.email || '', job.address, job.title, today,
      'Net 15', addDays(today, 15), 'Draft', JSON.stringify(items), total, notes, null, today);
    persistInvoiceTax(userId,invoiceId,q.getUserById.get(userId)?.country==='IN'?
      {currency:'INR',supplierGstin:'',supplierState:'',customerGstin:'',placeOfSupply:'',
        hsnSac:'',gstRate:0,taxable:total,cgst:0,sgst:0,utgst:0,igst:0,upiVpa:''}:null);
    q.linkInvoiceToJob.run(job.id, invoiceId, userId);
  }

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
    createUser({ email, passwordHash = null, name, businessName = '', termsVersion = '2026-10-19', googleSub = null, emailVerified = 0, verificationToken = null, verificationExpires = null, now = Date.now(), country = 'US' }) {
      const id = randomUUID();
      const cleanEmail = email.trim().toLowerCase();
      if(!['US','IN'].includes(country))throw new Error('Unsupported signup country.');
      q.insertUser.run(
        id,
        cleanEmail,
        passwordHash,
        name.trim(),
        businessName ? businessName.trim() : null,
        null, null, null,
        country, country==='IN'?'INR':'USD',
        googleSub || null, null,
        emailVerified ? 1 : 0,
        verificationToken, verificationExpires,
        null, null,
        'trial', 'trial',
        todayStr(), 15,
        now, now, termsVersion
      );
      if(country==='IN')db.prepare("UPDATE users SET time_zone='Asia/Kolkata' WHERE id=?").run(id);
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

    updateUser(id, { name, businessName, trade, phone, location, country, currency, usState, usZip, timeZone, googlePlaceUrl, indiaState, gstin, upiVpa }) {
      const invalid=(message)=>{const error=new Error(message);error.code='invalid_us_profile';error.status=400;throw error;};
      const prior=q.getUserById.get(id);
      if(!prior)invalid('Account not found.');
      const nextCountry=country===undefined?prior.country||'US':country;
      if(!['US','IN'].includes(nextCountry))invalid('Choose United States or India.');
      const nextCurrency=nextCountry==='IN'?'INR':'USD';
      if(currency!==undefined&&currency!==nextCurrency)invalid('Currency must match the selected edition.');
      const switching=nextCountry!==prior.country;
      if(switching&&(pricedHistory(id)||prior.subscription_id))
        invalid('To switch editions, start with a new empty workspace. Existing records and payment history cannot be relabeled.');
      if(!switching&&prior.currency!==nextCurrency&&currency!==undefined)
        invalid('Legacy currency records require review and cannot be relabeled.');
      if(nextCountry==='US'){
        for(const [label,v,valid] of [['US state',usState,validUsState],['ZIP code',usZip,validUsZip],['US time zone',timeZone,validUsTimeZone]])
          if(v!==undefined&&(typeof v!=='string'||!valid(v.trim())))invalid('Enter a valid '+label+'.');
      }
      if(phone!==undefined&&(typeof phone!=='string'||phone.length>40))invalid('Phone number is too long.');
      const inState=nextCountry==='IN'?(indiaState===undefined?(switching?'':prior.india_state):String(indiaState).trim()):'';
      const taxId=nextCountry==='IN'?(gstin===undefined?(switching?'':prior.gstin):String(gstin).trim().toUpperCase()):'';
      const vpa=nextCountry==='IN'?(upiVpa===undefined?(switching?'':prior.upi_vpa):String(upiVpa).trim()):'';
      if(!validIndianState(inState)||!validGSTIN(taxId)||!validUpiVpa(vpa))
        invalid('Enter a valid Indian state code, GSTIN and UPI ID.');
      if(taxId&&inState&&taxId.slice(0,2)!==inState)invalid('GSTIN state does not match your selected state.');
      if(taxId&&!inState)invalid('Select a registered business state for the GSTIN.');
      const now=Date.now();
      const save=db.transaction(()=>{
        q.updateUser.run(
          name!==undefined?name.trim():null,businessName!==undefined?businessName.trim():null,
          trade!==undefined?trade.trim():null,phone!==undefined?phone.trim():null,
          location!==undefined?location.trim():null,
          nextCountry,!switching&&prior.currency!==nextCurrency?prior.currency:nextCurrency,
          nextCountry==='US'?(usState===undefined?(switching?'':null):usState.trim()):'',
          nextCountry==='US'?(usZip===undefined?(switching?'':null):usZip.trim()):'',
          nextCountry==='IN'?'Asia/Kolkata':(timeZone===undefined?(switching?'':null):timeZone.trim()),
          googlePlaceUrl!==undefined?googlePlaceUrl.trim():null,now,id
        );
        q.updateIndiaProfile.run(inState,taxId,vpa,id);
      });
      save();
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
      const businessToday=businessLocalDate(user.time_zone);
      const usedDays = Math.max(0, daysBetween(user.trial_started_at || today, today));
      const trialDaysTotal = user.trial_days_total || 15;
      const trialDaysRemaining = Math.max(0, trialDaysTotal - usedDays);

      let effectivePlanStatus = user.plan_status;
      const recurring = subscriptionForUser.get(userId);
      if (recurring && ['active','charged'].includes(recurring.status) && Date.now() >= recurring.start_at * 1000 && effectivePlanStatus !== 'active') {
        const end = recurring.current_end && recurring.current_end > Date.now() ? recurring.current_end : Date.now() + 32 * 86400000;
        q.setUserPlan.run('pro','active',recurring.subscription_id,end,Date.now(),userId);
        effectivePlanStatus = 'active';
      }
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
        if (status === 'Sent' && i.due_date && i.due_date < businessToday) status = 'Overdue';
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
          jobId: i.job_id || null,
          currency: i.invoice_currency || user.currency || 'USD',
          supplierGstin: i.supplier_gstin || '', supplierState:i.supplier_state || '',
          customerGstin:i.customer_gstin || '',placeOfSupply:i.place_of_supply || '',hsnSac:i.hsn_sac || '',
          gstRate:Number(i.gst_rate)||0,taxable:Number(i.taxable_total)||0,
          cgst:Number(i.cgst)||0,sgst:Number(i.sgst)||0,utgst:Number(i.utgst)||0,igst:Number(i.igst)||0,
          upiVpa:i.upi_vpa_snapshot||'',
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
          indiaState: user.india_state || '',
          gstin: user.gstin || '',
          upiVpa: user.upi_vpa || '',
          usState: user.us_state || '',
          usZip: user.us_zip || '',
          timeZone: user.time_zone || '',
          googlePlaceUrl: user.google_place_url || '',
          trialStartedAt: user.trial_started_at,
          trialDaysTotal: trialDaysTotal,
          trialDaysRemaining: trialDaysRemaining,
          planStatus: effectivePlanStatus,
          subscription: this.getUserSubscription(userId) ? { status: this.getUserSubscription(userId).status, id: this.getUserSubscription(userId).subscription_id } : null,
          monthlyPrice: user.country==='IN'?500:20,
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
        jobs: jobsStore.listJobs(userId).map(j => ({...j, invoiceId: invoices.find(i => i.jobId === j.id)?.id || null})),
        crew: jobsStore.listCrew(userId),
        reminders: reminders.listReminders(userId),
        quotes: quotesStore.listQuotes(userId),
        reminderOptouts: reminders.listEmailOptouts(userId),
      };
    },

    ...jobsStore,
    ...reminders,
    ...quotesStore,

    createLead(userId, payload) {
      const today = userBusinessToday(userId);
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
      const previous = q.getLead.get(leadId, userId);
      if (!previous) return { ok: true };
      const now = userBusinessToday(userId);
      q.updateLead.run(
        updates.name, updates.phone, updates.email, updates.address, updates.source,
        updates.stage, updates.value, updates.nextFollowUp, updates.notes,
        now, leadId, userId
      );
      if (updates.stage === 'Done' && previous.stage !== 'Done') {
        const revId = 'RV-' + randomBytes(4).toString('hex');
        q.insertReview.run(revId, userId, updates.name || previous.name, updates.phone ?? previous.phone, updates.email ?? previous.email, updates.notes || previous.notes || 'Completed Service Job', now, 'Not Asked', null, null, '', now);
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
        dueDate: payload.dueDate || userBusinessToday(userId),
        done: false,
      };
      q.insertFollowUp.run(fu.id, userId, fu.leadId, fu.contactName, fu.phone, fu.channel, fu.task, fu.dueDate, 0, userBusinessToday(userId));
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
      const today = userBusinessToday(userId);
      const terms = payload.terms || 'Net 15';
      const items = payload.items && payload.items.length ? payload.items : [
        { description: payload.jobTitle || 'Service labor & materials', qty: 1, rate: Number(payload.amount) || 0 },
      ];
      const user=q.getUserById.get(userId);
      const tax=editionTax(user,items,payload);
      const total=tax?tax.total:items.reduce((s,it)=>s+(Number(it.qty)||1)*(Number(it.rate)||0),0);
      const id = String(q.nextInvoiceNumber.run().lastInsertRowid);
      const inv = {
        id,
        customerName: (payload.customerName || '').trim(),
        customerEmail: (payload.customerEmail || '').trim(),
        customerAddress: (payload.customerAddress || '').trim(),
        jobTitle: (payload.jobTitle || '').trim(),
        issueDate: payload.issueDate || today,
        terms,
        dueDate: payload.dueDate || addDays(payload.issueDate || today, termsToDays(terms)),
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
      persistInvoiceTax(userId,id,tax);
      return {...inv,currency:tax?'INR':'USD',...(tax||{})};
    },

    // Validate editable invoice line items before committing any financial totals.
    // Owner approval remains manual; generating a draft never sends or charges anyone.
    validateInvoiceItems(items) {
      if (!Array.isArray(items) || !items.length || items.length > 20) {
        throw Object.assign(new Error('Provide between 1 and 20 invoice line items.'), {code:'invalid_invoice_items',status:400});
      }
      return items.map(item => {
        const description = typeof item?.description === 'string' ? item.description.trim() : '';
        const qty = Number(item?.qty), rate = Number(item?.rate);
        if (!description || description.length > 180 || !Number.isFinite(qty) || !Number.isFinite(rate) ||
            qty <= 0 || qty > 10000 || rate < 0 || rate > 1000000 ||
            Math.abs(qty*100-Math.round(qty*100)) > 0.000001 ||
            Math.abs(rate*100-Math.round(rate*100)) > 0.000001)
          throw Object.assign(new Error('Check line item descriptions, quantities and rates (max 2 decimals).'), {code:'invalid_invoice_items',status:400});
        return {description,qty,rate};
      });
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
      items = this.validateInvoiceItems(items);
      const user=q.getUserById.get(userId);
      const gstFields={gstRate:p.gstRate??inv.gst_rate,customerGstin:p.customerGstin??inv.customer_gstin,
        placeOfSupply:p.placeOfSupply??inv.place_of_supply,hsnSac:p.hsnSac??inv.hsn_sac};
      const tax=editionTax(user,items,gstFields);
      const total=tax?tax.total:Math.round(items.reduce((s,it)=>s+it.qty*it.rate,0)*100)/100;
      const terms = p.terms || inv.terms;
      const dueDate = p.dueDate || (p.terms ? addDays(inv.issue_date || userBusinessToday(userId), termsToDays(terms)) : inv.due_date);
      const status = p.status || inv.status;
      if (inv.job_id && status !== 'Draft' && total <= 0) {
        throw Object.assign(new Error('Enter and save a positive invoice amount before marking this job invoice as sent or paid.'), {code:'invoice_needs_pricing',status:409});
      }
      const paidAt = status === 'Paid' ? (inv.paid_at || userBusinessToday(userId)) : null;

      q.updateInvoice.run(
        p.customerName, p.customerEmail, p.customerAddress, p.jobTitle,
        terms, dueDate, status, JSON.stringify(items), total, p.notes,
        paidAt, String(id), userId
      );
      persistInvoiceTax(userId,id,tax);
      return { ok: true };
    },

    updateInvoiceStatus(userId, id, status) {
      const original = q.getInvoice.get(String(id), userId);
      if (!original) throw Object.assign(new Error('Invoice not found.'), {code:'not_found',status:404});
      const owner=q.getUserById.get(userId);
      if (owner?.country==='IN'&&owner.gstin&&status!=='Draft'&&
          (!original.supplier_gstin||!original.hsn_sac||!original.place_of_supply))
        throw Object.assign(new Error('Review and save GST details before marking this invoice Sent or Paid.'),{code:'gst_review_required',status:409});
      if (original.job_id && status !== 'Draft' && Number(original.total) <= 0) {
        throw Object.assign(new Error('Review and enter the invoice pricing before marking it sent or paid.'), {code:'invoice_needs_pricing',status:409});
      }
      const paidAt = status === 'Paid' ? userBusinessToday(userId) : null;
      q.updateInvoiceStatus.run(status, paidAt, String(id), userId);
      return { ok: true };
    },

    deleteInvoice(userId, id) {
      q.deleteInvoice.run(String(id), userId);
      return { ok: true };
    },

    resolveBankMatch(userId, txId, action, targetInvoiceId) {
      if (action === 'confirm' && targetInvoiceId) {
        const source = q.getInvoice.get(String(targetInvoiceId), userId);
        if (!source) throw Object.assign(new Error('The selected invoice was not found.'), {code:'not_found',status:404});
        const owner=q.getUserById.get(userId);
        if(owner?.country==='IN'&&owner.gstin&&(!source.supplier_gstin||!source.hsn_sac||!source.place_of_supply))
          throw Object.assign(new Error('Finish reviewing GST details before recording this invoice as paid.'),{code:'gst_review_required',status:409});
        if (source.job_id && Number(source.total) <= 0) {
          throw Object.assign(new Error('Set invoice pricing before recording a payment against this job draft.'), {code:'invoice_needs_pricing',status:409});
        }
      }
      if (action === 'confirm') {
        q.resolveBankMatch.run('matched', targetInvoiceId || null, targetInvoiceId || null, txId, userId);
        if (targetInvoiceId) {
          q.updateInvoiceStatus.run('Paid', userBusinessToday(userId), String(targetInvoiceId), userId);
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

    updateReview(userId, id, updates) {
      q.updateReview.run(updates.customerName, updates.customerPhone, updates.customerEmail, updates.jobTitle, id, userId);
      return { ok: true };
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
        jobsStore.clear(userId);
        reminders.clearReminderData(userId);
        quotesStore.clearQuotes(userId);
        // Clear workspace was explicitly confirmed by the owner. After business
        // records are gone, a legacy INR test workspace can start fresh in USD.
        // Billing/payment history survives Clear workspace and blocks the switch.
        db.prepare(`
          UPDATE users SET currency='USD', updated_at=?
          WHERE id=? AND currency='INR' AND COALESCE(country,'US')='US'
            AND NOT EXISTS (SELECT 1 FROM payments WHERE user_id=?)
            AND NOT EXISTS (SELECT 1 FROM recurring_subscriptions WHERE user_id=?)
        `).run(Date.now(),userId,userId,userId);
      });
      run();
      return { ok: true };
    },

    // ---------------------------------------------------------------- Recurring subscriptions
    getSubscription(id) { return subscriptionFind.get(id) || null; },
    getUserSubscription(userId) { return subscriptionForUser.get(userId) || null; },
    createSubscription(userId, id, startAt) {
      if (subscriptionFind.get(id)) return;
      subscriptionInsert.run(id, userId, 'created', startAt, Date.now());
    },
    updateSubscription(id, status, currentEnd = null) {
      const row = subscriptionFind.get(id);
      if (!row) return false;
      // Never grant access based on checkout callback alone; confirmed provider events determine status.
      subscriptionUpdate.run(status, currentEnd, id);
      if ((status === 'active' || status === 'charged') && Date.now() >= row.start_at * 1000) {
        q.setUserPlan.run('pro', 'active', id, currentEnd || Date.now() + 32 * 86400000, Date.now(), row.user_id);
      } else if (['cancelled','halted','expired'].includes(status) && (row.start_at * 1000 <= Date.now())) {
        q.setUserPlan.run('expired', 'expired', id, currentEnd || Date.now(), Date.now(), row.user_id);
      }
      return true;
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
        jobsStore.clear(userId);
        reminders.clearReminderData(userId);
        quotesStore.clearQuotes(userId);

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
