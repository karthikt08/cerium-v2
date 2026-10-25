// server/security.js
//
// Security helpers: signed cookies, CSRF protection, same-origin validation,
// session loading, rate limiting, and input sanitization.

import { createHmac } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { safeEqual } from './google.js';

// ---------------------------------------------------------------- signed cookie value
export function sign(secret, data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function unsign(secret, value) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const dot = value.indexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- cleaning text
export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// One cell of a CSV file. Quotes cells with formula characters (=, +, -, @) to prevent formula injection.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------------------------------------------------------------- who is asking?
export function loadSession(db, config) {
  return (req, res, next) => {
    const token = req.cookies && req.cookies[config.sessionCookie];
    req.sessionToken = typeof token === 'string' ? token : '';
    req.session = req.sessionToken ? db.getSession(req.sessionToken) : null;
    if (req.session && req.session.userId) {
      req.user = db.getUserById(req.session.userId);
    } else {
      req.user = null;
    }
    next();
  };
}

export function requireSession(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'not_signed_in' });
  next();
}

// Blocks requests from cross-site origins (CSRF protection)
export function requireSameOrigin(config) {
  return (req, res, next) => {
    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');
    let ok = false;
    if (fetchSite) {
      ok = fetchSite === 'same-origin' && (!origin || origin === 'null' || origin === config.baseUrl);
    } else if (origin) {
      ok = origin === config.baseUrl;
    } else {
      try {
        ok = new URL(req.get('referer') || '').origin === config.baseUrl;
      } catch {
        ok = false;
      }
    }
    if (!ok) return res.status(403).json({ error: 'bad_origin' });
    next();
  };
}

// Secret token CSRF check for mutations
export function requireCsrf(req, res, next) {
  const sent = req.get('x-csrf-token') || (req.body && req.body._csrf) || '';
  if (!req.session || !sent || !safeEqual(sent, req.session.csrfToken)) {
    return res.status(403).json({ error: 'bad_csrf' });
  }
  next();
}

// Admin authorization check
export function requireAdmin(config) {
  return (req, res, next) => {
    if (req.session && req.user?.email_verified && config.adminEmails.includes(req.session.email.toLowerCase())) return next();
    return next('route');
  };
}

// ---------------------------------------------------------------- rate limiting
export function makeLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const url = req.originalUrl || req.path || '';
      if (url.startsWith('/auth/')) {
        return res.redirect(303, '/signup.html?error=slow');
      }
      if (url.startsWith('/api/')) return res.status(429).json({ error: 'too_many_requests' });
      res.status(429).type('text/plain').send('Too many requests. Please wait a few minutes and try again.');
    },
  });
}
