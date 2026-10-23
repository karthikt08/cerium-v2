// server/config.js
//
// Reads settings from environment variables and validates them strictly.
// In production the server refuses to start if essential settings are missing or weak.

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The date of the Terms and the Privacy Policy that people accept when they register or join.
export const TERMS_VERSION = '2026-10-19';

export class ConfigError extends Error {
  constructor(problems) {
    super('Bad settings:\n - ' + problems.join('\n - '));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

// Text that is only in the example file. If seen, the real value was never configured.
const PLACEHOLDER = /(paste|your-|change-?me|example|xxxx)/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function buildConfig(env = process.env) {
  const problems = [];
  const warnings = [];
  const isProd = env.NODE_ENV === 'production';
  const get = (key) => String(env[key] ?? '').trim();

  // ---- PORT and HOST
  let port = 3000;
  if (get('PORT')) {
    port = Number(get('PORT'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      problems.push('PORT must be a whole number from 1 to 65535.');
      port = 3000;
    }
  }
  const host = get('HOST') || (isProd ? '0.0.0.0' : '127.0.0.1');

  // ---- BASE_URL: the public address of the site
  let baseUrl = `http://localhost:${port}`;
  const rawBase = get('BASE_URL') || (isProd ? '' : baseUrl);
  try {
    const u = new URL(rawBase);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocol');
    if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash || u.username || u.password) {
      throw new Error('shape');
    }
    baseUrl = u.origin;
  } catch {
    problems.push('BASE_URL must be a web address with nothing after it, like https://cerium.com');
  }
  const cookieSecure = baseUrl.startsWith('https://');
  if (isProd) {
    if (!cookieSecure) problems.push('In production, BASE_URL must start with https://');
    if (LOCAL_HOSTS.includes(new URL(baseUrl).hostname)) problems.push('In production, BASE_URL cannot be localhost.');
  }

  // ---- Google sign-in keys
  const googleClientId = get('GOOGLE_CLIENT_ID');
  const googleClientSecret = get('GOOGLE_CLIENT_SECRET');
  const googleConfigured =
    googleClientId.endsWith('.apps.googleusercontent.com') &&
    googleClientSecret.length > 0 &&
    !PLACEHOLDER.test(googleClientId) &&
    !PLACEHOLDER.test(googleClientSecret);
  if (!googleConfigured) {
    const msg =
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing, or still the example text. Sign-in will not work. See SETUP.md, step 3.';
    if (isProd) problems.push(msg);
    else warnings.push(msg);
  }

  // ---- Razorpay payment keys
  const razorpayKeyId = get('RAZORPAY_KEY_ID');
  const razorpayKeySecret = get('RAZORPAY_KEY_SECRET');
  const razorpayWebhookSecret = get('RAZORPAY_WEBHOOK_SECRET');
  const razorpayPlanId = get('RAZORPAY_PLAN_ID');
  const razorpayConfigured =
    razorpayKeyId.length > 0 &&
    razorpayKeySecret.length > 0 &&
    !PLACEHOLDER.test(razorpayKeyId) &&
    !PLACEHOLDER.test(razorpayKeySecret);

  const subscriptionsConfigured = razorpayConfigured &&
    /^plan_[A-Za-z0-9]+$/.test(razorpayPlanId) &&
    razorpayWebhookSecret.length >= 16 && !PLACEHOLDER.test(razorpayWebhookSecret);

  let priceCents = 2000;
  if (get('PRICE_CENTS')) {
    const pc = Number(get('PRICE_CENTS'));
    if (Number.isInteger(pc) && pc > 0) priceCents = pc;
  }
  const currency = get('CURRENCY') || 'USD';
  if(currency!=='USD')problems.push('CERIUM US edition requires CURRENCY=USD. Never silently relabel existing amounts.');

  if (!razorpayConfigured) {
    warnings.push('Razorpay credentials are missing. Recurring billing is disabled; no simulation payments are available.');
  }

  if (!subscriptionsConfigured) warnings.push('Recurring subscriptions require RAZORPAY_PLAN_ID and RAZORPAY_WEBHOOK_SECRET. Checkout is disabled until configured.');

  // ---- SESSION_SECRET: signs the short note kept while a person is at Google and cookie notes
  let sessionSecret = get('SESSION_SECRET');
  if (sessionSecret.length < 32 || PLACEHOLDER.test(sessionSecret)) {
    if (isProd) {
      problems.push('SESSION_SECRET must be random text of at least 32 characters. Make one with: npm run gen-secret');
    } else {
      sessionSecret = randomBytes(32).toString('base64url');
      warnings.push('SESSION_SECRET is not set. Using a temporary one for this run. Make a real one with: npm run gen-secret');
    }
  }

  // ---- DATABASE_PATH: where SQLite database is saved
  let databasePath = get('DATABASE_PATH');
  if (!databasePath) {
    if (isProd) {
      problems.push('DATABASE_PATH must be set in production. Point it to a disk that is kept between deploys, for example /data/cerium.db');
    }
    databasePath = path.join(ROOT, 'data', 'cerium.db');
  } else if (databasePath !== ':memory:' && !path.isAbsolute(databasePath)) {
    if (isProd) problems.push('DATABASE_PATH must be a full path (it starts with /) in production.');
    databasePath = path.resolve(ROOT, databasePath);
  } else if (isProd && databasePath === ':memory:') {
    problems.push('DATABASE_PATH cannot be :memory: in production. The database would be lost.');
  }

  // ---- TRUST_PROXY: how many proxies sit in front of the server
  let trustProxy = 0;
  const tp = get('TRUST_PROXY');
  if (tp === '') {
    if (isProd) problems.push('TRUST_PROXY must be set in production. Use 1 if your host puts one proxy in front of the app (most hosts do). Use 0 if there is none.');
  } else if (!/^\d{1,2}$/.test(tp)) {
    problems.push('TRUST_PROXY must be a number like 0 or 1. Do not use "true".');
  } else {
    trustProxy = Number(tp);
  }

  // ---- ADMIN_EMAILS: allowed to access admin exports
  const adminEmails = get('ADMIN_EMAILS')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const e of adminEmails) {
    if (!EMAIL.test(e)) problems.push(`ADMIN_EMAILS has an address that does not look right: ${e}`);
  }

  // ---- SESSION_DAYS: how long a sign-in lasts
  let sessionDays = 7;
  if (get('SESSION_DAYS')) {
    sessionDays = Number(get('SESSION_DAYS'));
    if (!Number.isInteger(sessionDays) || sessionDays < 1 || sessionDays > 30) {
      problems.push('SESSION_DAYS must be a whole number from 1 to 30.');
      sessionDays = 7;
    }
  }

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    mode: isProd ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development',
    isProd,
    port,
    host,
    baseUrl,
    cookieSecure,
    sessionCookie: cookieSecure ? '__Host-cerium_sid' : 'cerium_sid',
    oauthCookie: cookieSecure ? '__Host-cerium_oauth' : 'cerium_oauth',
    googleClientId,
    googleClientSecret,
    googleConfigured,
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret,
    razorpayPlanId,
    razorpayConfigured,
    subscriptionsConfigured,
    priceCents,
    currency,
    sessionSecret,
    databasePath,
    trustProxy,
    adminEmails: Object.freeze(adminEmails),
    sessionDays,
    termsVersion: TERMS_VERSION,
    warnings: Object.freeze(warnings),
  });
}
