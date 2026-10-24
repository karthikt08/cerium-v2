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
  // Separate country plans; the original USD default remains unchanged.
  const razorpayIndiaPlanId=get('RAZORPAY_IN_PLAN_ID');
  const indiaSubscriptionsConfigured=razorpayConfigured &&
    /^plan_[A-Za-z0-9]+$/.test(razorpayIndiaPlanId) &&
    razorpayWebhookSecret.length>=16&&!PLACEHOLDER.test(razorpayWebhookSecret);
  const priceInPaise=50000; // Rs 500/month founding-customer plan, excluding applicable tax
  const currency = get('CURRENCY') || 'USD';
  if(currency!=='USD')problems.push('CERIUM US edition requires CURRENCY=USD. Never silently relabel existing amounts.');

  if (!razorpayConfigured) {
    warnings.push('Razorpay credentials are missing. Recurring billing is disabled; no simulation payments are available.');
  }

  if (!subscriptionsConfigured) warnings.push('Recurring subscriptions require RAZORPAY_PLAN_ID and RAZORPAY_WEBHOOK_SECRET. Checkout is disabled until configured.');

  // Region restrictions are mandatory on production deployments. During local
  // development, explicitly enable the gate only with an external GeoIP key.
  const regionAccessMode=get('REGION_ACCESS_MODE')||(isProd?'enforce':'off');
  if(!['enforce','off'].includes(regionAccessMode))
    problems.push('REGION_ACCESS_MODE must be enforce or off.');
  const regionEnforced=regionAccessMode==='enforce';
  if(isProd&&!regionEnforced)problems.push('CERIUM production must enforce region access.');
  const geoIpApiKey=get('GEOIP_API_KEY');
  if(regionEnforced&&(geoIpApiKey.length<12||PLACEHOLDER.test(geoIpApiKey)))
    problems.push('GEOIP_API_KEY is required for server-side US/India region and VPN checks.');

  // ---- Optional phone verification for paid checkout.
  // 'development' never sends SMS and is only allowed on loopback.
  // 'twilio' calls Verify; production without a verified provider cannot
  // authorize a NEW recurring subscription.
  const phoneVerifyMode=get('PHONE_VERIFY_MODE')||(isProd?'off':'development');
  if(!['off','twilio','development'].includes(phoneVerifyMode))
    problems.push('PHONE_VERIFY_MODE must be off, twilio or development.');
  if(isProd&&phoneVerifyMode==='development')
    problems.push('PHONE_VERIFY_MODE=development is forbidden in production.');
  if(phoneVerifyMode==='development'&&!LOCAL_HOSTS.includes(new URL(baseUrl).hostname))
    problems.push('PHONE_VERIFY_MODE=development is only allowed on a loopback BASE_URL.');
  const twilioAccountSid=get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken=get('TWILIO_AUTH_TOKEN');
  const twilioVerifyServiceSid=get('TWILIO_VERIFY_SERVICE_SID');
  const phoneVerifyConfigured=/^AC[0-9a-f]{32}$/i.test(twilioAccountSid)
    && twilioAuthToken.length>=20 && !PLACEHOLDER.test(twilioAuthToken)
    && /^VA[0-9a-f]{32}$/i.test(twilioVerifyServiceSid);
  if(phoneVerifyMode==='twilio'&&!phoneVerifyConfigured)
    warnings.push('Twilio Verify credentials are missing or incomplete. New recurring checkout is unavailable until configured.');
  if(isProd&&phoneVerifyMode!=='twilio')
    warnings.push('Phone OTP is not configured; new recurring checkout is disabled. Existing subscriptions are unaffected.');

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
    razorpayIndiaPlanId,
    indiaSubscriptionsConfigured,
    priceInPaise,
    razorpayConfigured,
    subscriptionsConfigured,
    priceCents,
    currency,
    regionEnforced,
    regionAccessMode,
    geoIpApiKey,
    phoneVerifyMode,
    phoneVerifyConfigured,
    twilioAccountSid,
    twilioAuthToken,
    twilioVerifyServiceSid,
    sessionSecret,
    databasePath,
    trustProxy,
    adminEmails: Object.freeze(adminEmails),
    sessionDays,
    termsVersion: TERMS_VERSION,
    warnings: Object.freeze(warnings),
  });
}
