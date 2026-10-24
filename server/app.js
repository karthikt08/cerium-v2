// server/app.js
//
// Unified Express 5 Application: landing page, contractor workspace, complete authentication
// (Email/Password + Google OAuth), workspace REST APIs, Razorpay billing, and admin export.

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { ROOT } from './config.js';
import { randomToken, pkceChallenge, safeEqual, SignInError } from './google.js';
import { hashPassword, verifyPassword, validatePasswordStrength, generateToken } from './passwords.js';
import { makeRazorpay } from './razorpay.js';
import {createMarketGate} from './market-gate.js';
import {verifyOptOut} from './reminders.js';
import {
  sign, unsign, cleanText, csvCell,
  loadSession, requireSession, requireSameOrigin, requireCsrf, requireAdmin, makeLimiter,
} from './security.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const LOGIN_TIME = 10 * MINUTE;
const PAGE_FOR = { join: '/signup.html', login: '/login.html' };

function workspaceReturnTarget(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '';

  try {
    const target = new URL(value, 'http://cerium.local');
    if (target.origin !== 'http://cerium.local') return '';
    if (!['/app', '/app.html'].includes(target.pathname)) return '';
    return target.pathname + target.search + target.hash;
  } catch {
    return '';
  }
}

export function createApp({ config, db, google = null, razorpay = null, now = () => Date.now(), limits = {}, log = true, marketGateOverride = null }) {
  const limit = {
    global: { windowMs: 15 * MINUTE, limit: 1200 },
    auth: { windowMs: 15 * MINUTE, limit: 60 },
    write: { windowMs: 15 * MINUTE, limit: 60 },
    ...limits,
  };
  const authLimiter = makeLimiter(limit.auth);
  const writeLimiter = makeLimiter(limit.write);
  const sameOrigin = requireSameOrigin(config);

  const cookieBase = { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };

  const rzp = razorpay || makeRazorpay(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // ------------------------------------------------------------ Safety Headers & CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https://*.razorpay.com'],
          connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
          formAction: ["'self'", 'https://accounts.google.com'],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      strictTransportSecurity: config.isProd ? { maxAge: 15552000 } : false,
      referrerPolicy: { policy: 'same-origin' },
    })
  );

  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
    next();
  });

  if (log) {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`));
      next();
    });
  }

  // Health check endpoint
  app.get('/healthz', (req, res) => {
    res.type('text/plain').send(db.ping() ? 'ok' : 'database problem');
  });

  app.use(makeLimiter(limit.global));

  // Host normalization on local development
  const baseHost = new URL(config.baseUrl).host;
  if (!config.isProd) {
    app.use((req, res, next) => {
      if (req.get('host') === baseHost) return next();
      if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, config.baseUrl + req.originalUrl);
      return res.status(400).type('text/plain').send(`Wrong address. Use ${config.baseUrl}`);
    });
  }

  // ------------------------------------------------------------ Razorpay Webhooks (Raw Body)
  app.post(
    '/webhooks/razorpay',
    express.raw({ type: 'application/json', limit: '256kb' }),
    (req, res) => {
      const signature = req.get('x-razorpay-signature');
      if (!rzp.verifyWebhook(req.body, signature)) {
        return res.status(400).json({ error: 'invalid_signature' });
      }
      try {
        const event = JSON.parse(req.body.toString('utf8'));
        const subscription = event.payload?.subscription?.entity;
        if (subscription && typeof subscription.id === 'string' && subscription.id.startsWith('sub_')) {
          const status = String(subscription.status || '');
          const allowed = ['authenticated','active','charged','pending','halted','cancelled','expired','completed'];
          if (allowed.includes(status)) {
            const normalized = status === 'completed' ? 'expired' : status;
            db.updateSubscription(subscription.id, normalized, Number(subscription.current_end) ? subscription.current_end * 1000 : null);
          }
        }
        if (event.event === 'payment.captured' || event.event === 'order.paid') {
          const payment = event.payload && event.payload.payment && event.payload.payment.entity;
          if (payment) {
            db.markPaid({
              orderId: payment.order_id,
              paymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
            });
          }
        } else if (event.event === 'payment.failed') {
          const payment = event.payload && event.payload.payment && event.payload.payment.entity;
          if (payment && payment.order_id) {
            db.markPaymentFailed(payment.order_id);
          }
        }
        res.status(200).json({ status: 'ok' });
      } catch (err) {
        res.status(400).json({ error: 'malformed_webhook_payload' });
      }
    }
  );

  // ------------------------------------------------------------ IP territory and proxy gating
  // Webhooks and health checks bypass visitor restrictions; no login or
  // workspace action can occur without an allowed visitor IP in production.
  const marketGate=createMarketGate({enabled:config.marketGateEnabled,apiKey:config.marketIpapiKey});
  app.use(marketGateOverride || marketGate.middleware);

  // ------------------------------------------------------------ Parsers & Session Loading
  app.use(cookieParser());
  app.use(express.json({ limit: '2kb' }));
  app.use(express.urlencoded({ extended: false, limit: '2kb' }));
  app.use(loadSession(db, config));

  // Token-gated unsubscribe endpoint. Opening an email does NOT mutate settings;
  // the recipient must confirm by POST. No sign-in required for the recipient.
  app.get('/unsubscribe', (req,res) => {
    const token=typeof req.query.token==='string'?req.query.token:'';
    if(!verifyOptOut(token,config.sessionSecret))return res.status(400).type('text/plain').send('Invalid unsubscribe link.');
    res.set('Cache-Control','no-store');
    res.set('Referrer-Policy','no-referrer');
    res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stop CERIUM reminders</title><main><h1>Stop payment reminders?</h1><p>Confirm to stop automated invoice reminders from this business.</p><form method="post" action="/unsubscribe"><input type="hidden" name="token" value="'+token+'"><button type="submit">Stop reminders</button></form></main></html>');
  });
  app.post('/unsubscribe', authLimiter, (req,res) => {
    const token=typeof req.body?.token==='string'?req.body.token:'';
    const decoded=verifyOptOut(token,config.sessionSecret);
    if(!decoded)return res.status(400).type('text/plain').send('Invalid unsubscribe link.');
    db.optOut(decoded.userId,decoded.email);
    res.set('Cache-Control','no-store');
    res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribed</title><main><h1>You are unsubscribed.</h1><p>This business will not send you more CERIUM payment reminders.</p></main></html>');
  });

  // Public estimate approval uses a scoped, 30-day HMAC link. Visiting a link
  // is read-only; clicking Accept or Decline makes the one-time change.
  const escapeQuoteHtml = value => String(value??'').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const quotePage = (title,body) => '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeQuoteHtml(title)+' · CERIUM</title>'+
    '<style>*{box-sizing:border-box}body{margin:0;background:#f5f6fb;font-family:system-ui,-apple-system,sans-serif;color:#273653}main{max-width:700px;margin:7vh auto;padding:36px;background:white;border:1px solid #e5e9f3;border-radius:22px;box-shadow:0 22px 60px #34375914}h1{font-size:29px;letter-spacing:-.9px}h2{font-size:19px}p{line-height:1.6;color:#66738c}.brand{font-size:13px;font-weight:800;letter-spacing:3px;color:#765ec4}table{border-collapse:collapse;width:100%;margin:25px 0}th,td{text-align:left;border-bottom:1px solid #e9ebf3;padding:12px 8px;font-size:14px}th{font-size:12px;color:#65738a}td:last-child,th:last-child{text-align:right}.total{font-size:24px;font-weight:800;text-align:right}button{font:inherit;padding:13px 23px;background:#5c52ac;color:white;border:0;border-radius:10px;cursor:pointer}button.secondary{background:#f1eefb;color:#5449a0}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:25px 0}.meta{font-size:13px}.note{padding:16px;background:#f6f4fc;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:750px){main{margin:0;padding:25px 18px;border-radius:0;min-height:100vh}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style></head><body><main><div class="brand">CERIUM / ESTIMATES</div>'+
    body+'</main></body></html>';
  const renderQuoteError = (res,err) => res.status(err.status||400).type('html').send(quotePage('Estimate unavailable',
    '<h1>'+escapeQuoteHtml(err.status===404?'Estimate not found':err.status===410?'Link expired':'Cannot complete request')+'</h1><p>'+
    escapeQuoteHtml(err.message||'Please contact the contractor.')+'</p>'));
  const quoteHeaders = res => {
    res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');
    res.set('X-Robots-Tag','noindex, nofollow, noarchive');
  };
  app.get('/quote/:id', (req,res)=>{
    quoteHeaders(res);
    try{
      const {quote,businessName,expiresAt}=db.getPublicQuote(req.params.id,req.query.token,config.sessionSecret);
      const money=n=>new Intl.NumberFormat(quote.currency==='INR'?'en-IN':'en-US',
        {style:'currency',currency:quote.currency==='INR'?'INR':'USD'}).format(n);
      const rows=quote.items.map(i=>'<tr><td>'+escapeQuoteHtml(i.description)+
        '</td><td>'+escapeQuoteHtml(i.qty)+'</td><td>'+escapeQuoteHtml(money(i.rate))+
        '</td><td>'+escapeQuoteHtml(money(i.qty*i.rate))+'</td></tr>').join('');
      const token=escapeQuoteHtml(req.query.token);
      const actions=quote.status==='Sent'?
        '<p>Review the details carefully. Only choose Accept if you agree to the work and listed prices.</p>'+
        '<div class="actions"><form action="/quote/'+quote.id+'/respond" method="post">'+
        '<input type="hidden" name="token" value="'+token+'"><input type="hidden" name="decision" value="Accepted">'+
        '<button type="submit">Accept estimate</button></form>'+
        '<form action="/quote/'+quote.id+'/respond" method="post">'+
        '<input type="hidden" name="token" value="'+token+'"><input type="hidden" name="decision" value="Declined">'+
        '<button type="submit" class="secondary">Decline</button></form></div>':
        '<p><strong>This estimate is '+escapeQuoteHtml(quote.status.toLowerCase())+'.</strong> Contact the contractor for changes.</p>';
      const body='<h1>'+escapeQuoteHtml(quote.title)+'</h1><p>Prepared by <strong>'+
        escapeQuoteHtml(businessName)+'</strong> for '+escapeQuoteHtml(quote.customerName)+'.</p>'+
        '<p class="meta">Estimate #'+escapeQuoteHtml(quote.id.slice(0,8).toUpperCase())+
        ' · Decision link expires '+escapeQuoteHtml(new Date(expiresAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}))+'</p>'+
        '<table><thead><tr><th>Work</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>'+
        rows+'</tbody></table><div class="total">Total '+escapeQuoteHtml(money(quote.total))+'</div>'+
        (quote.notes?'<h2>Notes</h2><p class="note">'+escapeQuoteHtml(quote.notes)+'</p>':'')+actions+
        '<p class="meta">Approval confirms the estimate only. Scheduling and billing are handled separately.</p>';
      res.type('html').send(quotePage('Review estimate',body));
    }catch(err){renderQuoteError(res,err);}
  });
  app.post('/quote/:id/respond',authLimiter,sameOrigin,(req,res)=>{
    quoteHeaders(res);
    try{
      const answer=db.respondQuote(req.params.id,req.body?.token,config.sessionSecret,req.body?.decision);
      res.type('html').send(quotePage('Response recorded',
        '<h1>Estimate '+escapeQuoteHtml(answer.status.toLowerCase())+'</h1>'+
        '<p>Your response has been recorded. The contractor can now take the next step.</p>'));
    }catch(err){renderQuoteError(res,err);}
  });

  // ------------------------------------------------------------ Protected Workspace Routing
  // Unauthenticated users attempting to access workspace pages are redirected to login with returnTo preserved
  app.get(['/app', '/app.html'], (req, res, next) => {
    if (!req.session) {
      return res.redirect(303, `/login.html?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
  });

  // Serve static public assets
  app.use(express.static(path.join(ROOT, 'public'), { dotfiles: 'ignore', index: 'index.html', extensions: ['html'] }));

  // Prevent caching of private endpoints
  app.use(['/api', '/auth', '/admin'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ------------------------------------------------------------ Authentication Endpoints (/auth)
  const auth = express.Router();

  // Registration with Email & Password
  auth.post('/register', authLimiter, sameOrigin, async (req, res) => {
    const { email, password, name, businessName } = req.body || {};
    const cleanEmail = cleanText(email, 254).toLowerCase();
    const cleanName = cleanText(name, 120);
    const cleanBusiness = cleanText(businessName, 120);

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({ error: 'invalid_email', message: 'A valid email address is required.' });
    }
    if (!cleanName) {
      return res.status(400).json({ error: 'invalid_name', message: 'Full name is required.' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      return res.status(400).json({ error: 'weak_password', message: strength.message });
    }

    const existing = db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'email_in_use', message: 'An account with this email address already exists. Please log in.' });
    }

    const passwordHash = hashPassword(password);
    const verificationToken = generateToken(32);
    const verificationExpires = now() + 24 * 60 * 60 * 1000;

    let user = db.createUser({
      email: cleanEmail,
      passwordHash,
      name: cleanName,
      businessName: cleanBusiness,
      termsVersion: config.termsVersion,
      emailVerified: 0,
      verificationToken,
      verificationExpires,
      now: now(),
    });

    if(req.market?.country==='IN')user=db.updateUser(user.id,{country:'IN'});
    const session = db.createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      ttlMs: config.sessionDays * DAY,
      now: now(),
    });

    res.cookie(config.sessionCookie, session.token, { ...cookieBase, maxAge: config.sessionDays * DAY });

    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessName: user.business_name || '',
        planStatus: user.plan_status,
      },
      csrfToken: session.csrfToken,
      verificationToken: config.isProd ? undefined : verificationToken,
    });
  });

  // Login with Email & Password
  auth.post('/login', authLimiter, sameOrigin, async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = cleanText(email, 254).toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'missing_credentials', message: 'Email and password are required.' });
    }

    const user = db.getUserByEmail(cleanEmail);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
    }

    if (req.sessionToken) db.deleteSession(req.sessionToken);

    const session = db.createSession({
      userId: user.id,
      sub: user.google_sub || '',
      email: user.email,
      name: user.name,
      ttlMs: config.sessionDays * DAY,
      now: now(),
    });

    res.cookie(config.sessionCookie, session.token, { ...cookieBase, maxAge: config.sessionDays * DAY });

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        businessName: user.business_name || '',
        planStatus: user.plan_status,
      },
      csrfToken: session.csrfToken,
    });
  });

  // Forgot Password: generate secure token
  auth.post('/forgot-password', authLimiter, sameOrigin, async (req, res) => {
    const { email } = req.body || {};
    const cleanEmail = cleanText(email, 254).toLowerCase();

    if (cleanEmail) {
      const user = db.getUserByEmail(cleanEmail);
      if (user) {
        const token = generateToken(32);
        const expiresAt = now() + 60 * MINUTE;
        db.setResetToken(user.id, token, expiresAt);
        if (!config.isProd) {
          return res.json({
            ok: true,
            message: 'Password reset link generated.',
            resetToken: token,
            resetUrl: `${config.baseUrl}/reset-password.html?token=${token}`,
          });
        }
      }
    }

    res.json({
      ok: true,
      message: 'If an account exists for that email, a password reset link has been dispatched.',
    });
  });

  // Reset Password using token
  auth.post('/reset-password', authLimiter, sameOrigin, async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'invalid_token', message: 'Password reset token is required.' });
    }

    const user = db.getUserByResetToken(token);
    if (!user || !user.reset_expires || user.reset_expires < now()) {
      return res.status(400).json({ error: 'expired_token', message: 'Reset link has expired or is invalid. Please request a new one.' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) {
      return res.status(400).json({ error: 'weak_password', message: strength.message });
    }

    const hash = hashPassword(newPassword);
    db.resetPassword(user.id, hash);

    res.json({ ok: true, message: 'Password reset successfully. You can now sign in with your new password.' });
  });

  // Email verification route
  auth.get('/verify-email', authLimiter, (req, res) => {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).send('Verification token is missing.');

    const user = db.getUserByVerificationToken(token);
    if (!user || !user.verification_expires || user.verification_expires < now()) {
      return res.status(400).send('This verification link is invalid or has expired.');
    }

    db.verifyUserEmail(user.id);
    res.redirect(303, '/app.html?verified=1');
  });

  // Google Sign-In: Step 1 (Redirect to Google)
  auth.post('/google', authLimiter, sameOrigin, (req, res) => {
    const intent = req.body && req.body.intent === 'join' ? 'join' : 'login';
    const returnTo = workspaceReturnTarget(cleanText(req.body && req.body.returnTo, 200));
    if (!google) return res.redirect(303, `${PAGE_FOR[intent]}?error=not-configured`);

    const state = randomToken(24);
    const nonce = randomToken(24);
    const verifier = randomToken(48);
    const business = intent === 'join' ? cleanText(req.body && req.body.business, 80) : '';

    const note = sign(config.sessionSecret, { s: state, n: nonce, v: verifier, i: intent, b: business, r: returnTo, e: now() + LOGIN_TIME });
    res.cookie(config.oauthCookie, note, { ...cookieBase, maxAge: LOGIN_TIME });
    res.redirect(303, google.buildAuthUrl({ state, nonce, codeChallenge: pkceChallenge(verifier) }));
  });

  // Google Sign-In: Step 2 (Callback from Google)
  auth.get('/google/callback', authLimiter, async (req, res) => {
    const note = unsign(config.sessionSecret, req.cookies && req.cookies[config.oauthCookie]);
    res.clearCookie(config.oauthCookie, cookieBase);
    const page = PAGE_FOR[note && note.i] || PAGE_FOR.join;
    const fail = (code) => res.redirect(303, `${page}?error=${code}`);

    if (!note || typeof note.e !== 'number' || note.e < now()) return fail('expired');
    if (req.query.error) return fail(req.query.error === 'access_denied' ? 'denied' : 'failed');

    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string' || !code || !safeEqual(state, note.s)) return fail('invalid');
    if (!google) return fail('not-configured');

    let profile;
    try {
      profile = await google.verifyCode({ code, codeVerifier: note.v, nonce: note.n });
    } catch (err) {
      console.error('[sign-in] failed:', err instanceof SignInError ? err.message : 'unexpected error');
      return fail(err instanceof SignInError && err.code === 'unverified' ? 'unverified' : 'failed');
    }

    if (req.sessionToken) db.deleteSession(req.sessionToken);

    let user = db.getUserByGoogleSub(profile.sub) || db.getUserByEmail(profile.email);
    if (!user) {
      user = db.createUser({
        email: profile.email,
        name: profile.name,
        businessName: note.b || '',
        googleSub: profile.sub,
        emailVerified: 1,
        termsVersion: config.termsVersion,
        now: now(),
      });
      if(req.market?.country==='IN')user=db.updateUser(user.id,{country:'IN'});
    }

    if (note.i === 'join') {
      db.joinWaitlist({ ...profile, business: note.b || '', termsVersion: config.termsVersion, now: new Date(now()) });
    } else if (db.getMember(profile.sub)) {
      db.refreshMember(profile);
    }

    const session = db.createSession({
      userId: user.id,
      sub: profile.sub,
      email: user.email,
      name: user.name,
      ttlMs: config.sessionDays * DAY,
      now: now(),
    });

    res.cookie(config.sessionCookie, session.token, { ...cookieBase, maxAge: config.sessionDays * DAY });

    const target = workspaceReturnTarget(note.r) || (note.i === 'join' ? '/app.html#settings' : '/app.html');
    res.redirect(303, target);
  });

  // Logout
  auth.post('/logout', sameOrigin, (req, res) => {
    if (req.session) {
      if (!safeEqual(req.get('x-csrf-token') || '', req.session.csrfToken)) {
        return res.status(403).json({ error: 'bad_csrf' });
      }
      db.deleteSession(req.sessionToken);
    }
    res.clearCookie(config.sessionCookie, cookieBase);
    res.status(204).end();
  });

  app.use('/auth', auth);

  // ------------------------------------------------------------ Workspace & Private API (/api)
  const api = express.Router();

  // Current session & user status
  api.get('/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.session) return res.json({ signedIn: false });
    const user = db.getUserById(req.session.userId);
    const member = db.getMember(req.session.sub || (user && user.google_sub) || req.session.userId);
    res.json({
      signedIn: true,
      csrfToken: req.session.csrfToken,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            businessName: user.business_name || (member && member.business) || '',
            trade: user.trade || '',
            phone: user.phone || '',
            location: user.location || '',
            country: user.country || 'US',
            currency: user.currency || 'USD',
            indiaState: user.india_state || '', gstin: user.gstin || '', upiVpa: user.upi_vpa || '',
          usState: user.us_state || '',
            usZip: user.us_zip || '',
            timeZone: user.time_zone || '',
            plan: user.plan,
            planStatus: user.plan_status,
            emailVerified: Boolean(user.email_verified),
          }
        : { email: req.session.email, name: req.session.name },
      member: member && { joinedAt: member.joinedAt, business: member.business },
    });
  });

  api.get('/market', (req,res)=>{
    res.set('Cache-Control','no-store');
    const m=req.market;
    res.json({country:m?.country||null,currency:m?.currency||null,monthlyPrice:m?.monthlyPrice||null,
      verified:Boolean(m?.country),developmentBypass:Boolean(m?.developmentBypass)});
  });

  // Update profile
  api.patch('/me', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    let updated;
    // Country selection is based on verified network location when enabled.
    // The user cannot spoof a different billing region via the profile API.
    if(config.marketGateEnabled&&req.body?.country&&req.body.country!==req.market?.country)
      return res.status(403).json({error:'country_mismatch',message:'Your selected country does not match your verified region.'});
    try { updated = db.updateUser(req.session.userId, req.body || {}); }
    catch(err) { if(err.code==='invalid_us_profile')return res.status(400).json({error:err.code,message:err.message}); throw err; }
    res.json({
      ok: true,
      account: {
        id: updated.id,
        name: updated.name,
        businessName: updated.business_name || '',
        trade: updated.trade || '',
        phone: updated.phone || '',
        location: updated.location || '',
        country: updated.country || 'US',
        currency: updated.currency || 'USD',
        indiaState: updated.india_state || '', gstin: updated.gstin || '', upiVpa: updated.upi_vpa || '',
        usState: updated.us_state || '',
        usZip: updated.us_zip || '',
        timeZone: updated.time_zone || '',
        planStatus: updated.plan_status,
      },
    });
  });

  // Get full workspace state
  api.get('/workspace', requireSession, (req, res) => {
    const ws = db.getWorkspace(req.session.userId);
    if (!ws) return res.status(404).json({ error: 'workspace_not_found' });
    res.json(ws);
  });

  // Keep expired workspaces readable and exportable, but prevent ALL business-data
  // mutations on the server (including direct API requests that bypass the UI).
  // Profile, support, billing, data export, and deletion remain available.
  api.use(['/leads', '/followups', '/invoices', '/bank', '/reviews', '/jobs', '/crew', '/reminders', '/quotes'], requireSession, (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const workspace = db.getWorkspace(req.session.userId);
    if (!workspace) return res.status(404).json({ error: 'workspace_not_found' });
    if (workspace.account.planStatus === 'expired') {
      return res.status(403).json({
        error: 'upgrade_required',
        message: 'Your 15-day trial has ended. Your records are still available to view and export. Activate Cerium Pro to add or change business records.',
      });
    }
    // Legacy non-USD records must remain in their original denomination.
    // Never allow new amounts to be created under that denomination in the
    // dollar-only product. Account export and deliberate workspace clearing
    // remain available outside this middleware.
    if (!((workspace.account.country==='US'&&workspace.account.currency==='USD')||
          (workspace.account.country==='IN'&&workspace.account.currency==='INR'))) {
      return res.status(409).json({
        error: 'currency_review_required',
        message: 'This workspace contains older non-dollar records. Export them and contact support for a reviewed migration, or explicitly clear disposable test data in Settings.',
      });
    }
    next();
  });

  // Quote editing is owner-only; customer approvals use the public signed link above.
  const quoteError = (res,err) => {
    if(err && err.code && err.status)return res.status(err.status).json({error:err.code,message:err.message});
    throw err;
  };
  api.post('/quotes',writeLimiter,sameOrigin,requireSession,requireCsrf,(req,res)=>{
    try{res.status(201).json(db.createQuote(req.session.userId,req.body));}
    catch(err){quoteError(res,err);}
  });
  api.patch('/quotes/:id',writeLimiter,sameOrigin,requireSession,requireCsrf,(req,res)=>{
    try{res.json(db.updateQuote(req.session.userId,req.params.id,req.body));}
    catch(err){quoteError(res,err);}
  });
  api.post('/quotes/:id/send',writeLimiter,sameOrigin,requireSession,requireCsrf,(req,res)=>{
    try{res.json(db.sendQuote(req.session.userId,req.params.id,config.baseUrl,config.sessionSecret));}
    catch(err){quoteError(res,err);}
  });
  api.get('/quotes/:id/link',requireSession,(req,res)=>{
    try{res.json(db.quoteLink(req.session.userId,req.params.id,config.baseUrl,config.sessionSecret));}
    catch(err){quoteError(res,err);}
  });
  api.post('/quotes/:id/convert',writeLimiter,sameOrigin,requireSession,requireCsrf,(req,res)=>{
    try{res.status(201).json(db.convertQuote(req.session.userId,req.params.id,req.body));}
    catch(err){quoteError(res,err);}
  });
  api.delete('/quotes/:id',writeLimiter,sameOrigin,requireSession,requireCsrf,(req,res)=>{
    try{res.json(db.deleteQuote(req.session.userId,req.params.id));}
    catch(err){quoteError(res,err);}
  });

  // Crew and Jobs scheduling — business-data writes share existing trial/CSRF rules.
  const scheduleError = (res, err) => {
    if (!err.code || !err.status) throw err;
    return res.status(err.status).json({ error: err.code, message: err.message });
  };
  api.post('/crew', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.status(201).json(db.addCrew(req.session.userId, req.body)); }
    catch(err) { scheduleError(res,err); }
  });
  api.delete('/crew/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.json(db.archiveCrew(req.session.userId,req.params.id)); }
    catch(err) { scheduleError(res,err); }
  });
  api.post('/jobs', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.status(201).json(db.createJob(req.session.userId,req.body)); }
    catch(err) { scheduleError(res,err); }
  });
  api.patch('/jobs/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.json(db.updateJob(req.session.userId,req.params.id,req.body)); }
    catch(err) { scheduleError(res,err); }
  });
  api.delete('/jobs/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.json(db.deleteJob(req.session.userId,req.params.id)); }
    catch(err) { scheduleError(res,err); }
  });

  // Owner-approved automated invoice payment reminders.
  api.post('/reminders', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.status(201).json(db.createReminder(req.session.userId,req.body)); }
    catch(err) { scheduleError(res,err); }
  });
  api.delete('/reminders/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.json(db.cancelReminder(req.session.userId,req.params.id)); }
    catch(err) { scheduleError(res,err); }
  });

  // Leads API
  api.post('/leads', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const lead = db.createLead(req.session.userId, req.body || {});
    res.status(201).json(lead);
  });

  api.patch('/leads/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.updateLead(req.session.userId, req.params.id, req.body || {});
    res.json({ ok: true });
  });

  api.delete('/leads/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.deleteLead(req.session.userId, req.params.id);
    res.json({ ok: true });
  });

  // Follow-ups API
  api.post('/followups', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const fu = db.createFollowUp(req.session.userId, req.body || {});
    res.status(201).json(fu);
  });

  api.patch('/followups/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.updateFollowUp(req.session.userId, req.params.id, req.body || {});
    res.json({ ok: true });
  });

  api.patch('/followups/:id/toggle', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.toggleFollowUp(req.session.userId, req.params.id);
    res.json({ ok: true });
  });

  api.delete('/followups/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.deleteFollowUp(req.session.userId, req.params.id);
    res.json({ ok: true });
  });

  // Invoice writes are protected by the same plan guard as every other business tool.
  api.post('/invoices', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const inv = db.createInvoice(req.session.userId, req.body || {});
    res.status(201).json(inv);
  });

  api.patch('/invoices/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    try { db.updateInvoice(req.session.userId, req.params.id, req.body || {});res.json({ ok: true }); }
    catch(err) { scheduleError(res,err); }
  });

  api.patch('/invoices/:id/status', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    try { db.updateInvoiceStatus(req.session.userId, req.params.id, req.body && req.body.status ? req.body.status : 'Paid');res.json({ ok: true }); }
    catch(err) { scheduleError(res,err); }
  });

  api.delete('/invoices/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.deleteInvoice(req.session.userId, req.params.id);
    res.json({ ok: true });
  });

  // Bank matching API
  api.post('/bank/match', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const { txId, action, targetInvoiceId } = req.body || {};
    try { db.resolveBankMatch(req.session.userId, txId, action, targetInvoiceId);res.json({ ok: true }); }
    catch(err) { scheduleError(res,err); }
  });

  api.post('/bank/sync', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const result = db.syncBankFeed(req.session.userId);
    res.json(result);
  });

  api.patch('/bank/connection', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const user = db.getUserById(req.session.userId);
    const newStatus = !user.bank_connected;
    const updated = db.setBankStatus(req.session.userId, {
      connected: newStatus,
      bankName: newStatus ? (user.bank_name || 'Business Checking (Read-Only)') : '',
      lastSynced: newStatus ? 'Just now' : '',
    });
    res.json({ bankConnected: Boolean(updated.bank_connected), bankName: updated.bank_name });
  });

  // Customer reviews API
  api.post('/reviews', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const rev = db.createReview(req.session.userId, req.body || {});
    res.status(201).json(rev);
  });

  api.patch('/reviews/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.updateReview(req.session.userId, req.params.id, req.body || {});
    res.json({ ok: true });
  });

  api.post('/reviews/:id/send', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.sendReviewRequest(req.session.userId, req.params.id);
    res.json({ ok: true, status: 'Sent' });
  });

  api.patch('/reviews/:id/complete', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.completeReview(req.session.userId, req.params.id);
    res.json({ ok: true, status: 'Reviewed' });
  });

  api.delete('/reviews/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.deleteReview(req.session.userId, req.params.id);
    res.json({ ok: true });
  });

  // Messages to founders API
  api.post('/messages', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const msg = db.createMessage(req.session.userId, req.body || {});
    res.status(201).json(msg);
  });

  api.delete('/messages/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.deleteMessage(req.session.userId, req.params.id);
    res.json({ ok: true });
  });

  // Recurring subscription consent: a saved authorization is required before any automatic debit.
  api.post('/billing/subscription', writeLimiter, sameOrigin, requireSession, requireCsrf, async (req, res) => {
    const user = db.getUserById(req.session.userId);
    if(config.marketGateEnabled&&user.country!==req.market?.country)
      return res.status(403).json({error:'country_mismatch',message:'Billing country and verified location do not match. Contact support if your business operates across regions.'});
    const indian=user.country==='IN'&&user.currency==='INR';
    const american=user.country==='US'&&user.currency==='USD';
    if(!indian&&!american)
      return res.status(403).json({error:'country_currency_mismatch',message:'Your workspace currency requires review before subscription checkout.'});
    const billingPlanId=indian?config.razorpayIndiaPlanId:config.razorpayPlanId;
    const billingAmount=indian?config.priceInPaise:config.priceCents;
    const billingCurrency=indian?'INR':'USD';
    if (!(indian?config.indiaSubscriptionsConfigured:config.subscriptionsConfigured))
      return res.status(503).json({error:'billing_not_configured',message:'Recurring payments in your region are not enabled yet. Your trial remains available.'});
    const existing = db.getUserSubscription(user.id);
    if (existing && !['cancelled','expired','halted'].includes(existing.status)) {
      return res.json({ keyId: config.razorpayKeyId, subscriptionId: existing.subscription_id, status: existing.status, amount:billingAmount,currency:billingCurrency });
    }
    try {
      // Trial begins when account is created. Use its original end date, not a fresh 15 days.
      const startAt = Math.max(Math.floor(Date.now()/1000) + 1800, Math.floor(new Date(user.trial_started_at + 'T00:00:00Z').getTime()/1000) + 15*86400);
      const plan = await rzp.getPlan(billingPlanId);
      if (plan.period !== 'monthly' || Number(plan.interval) !== 1 ||
          Number(plan.item?.amount) !== billingAmount ||
          plan.item?.currency !== billingCurrency) {
        return res.status(503).json({ error: 'billing_plan_mismatch', message: 'Monthly price configuration does not match checkout. Contact support.' });
      }
      const created = await rzp.createSubscription({ planId: billingPlanId, startAt, notes: { userId: user.id, edition: indian?'IN':'US' } });
      if (!created.id || !created.id.startsWith('sub_')) throw new Error('Missing subscription identifier');
      db.createSubscription(user.id, created.id, startAt);
      return res.json({ keyId: config.razorpayKeyId, subscriptionId: created.id, status: created.status, startAt, amount: billingAmount, currency: billingCurrency });
    } catch (err) {
      console.error('[billing] subscription creation failed:', err.message);
      return res.status(502).json({ error: 'billing_service_unavailable', message: 'Could not start subscription authorization. Please try again.' });
    }
  });

  api.post('/billing/subscription/verify', writeLimiter, sameOrigin, requireSession, requireCsrf, async (req, res) => {
    const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const saved = db.getSubscription(razorpay_subscription_id);
    if (!saved || saved.user_id !== req.session.userId) return res.status(404).json({ error: 'subscription_not_found' });
    if (!rzp.verifySubscription({ subscriptionId: razorpay_subscription_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) return res.status(400).json({ error: 'invalid_signature' });
    try {
      const remote = await rzp.getSubscription(razorpay_subscription_id);
      const status = String(remote.status || '');
      if (['authenticated','active','pending','charged'].includes(status)) {
        db.updateSubscription(saved.subscription_id, status, remote.current_end ? remote.current_end * 1000 : null);
        return res.json({ verified: true, status });
      }
      return res.status(409).json({ verified: false, status, message: 'Subscription is not authorized yet.' });
    } catch {
      return res.status(502).json({ error: 'billing_service_unavailable' });
    }
  });

  api.post('/billing/subscription/cancel', writeLimiter, sameOrigin, requireSession, requireCsrf, async (req, res) => {
    const saved = db.getUserSubscription(req.session.userId);
    if (!saved || ['cancelled','expired'].includes(saved.status)) return res.status(409).json({ error: 'no_active_subscription' });
    try {
      const remote = await rzp.cancelSubscription(saved.subscription_id, false);
      if (remote.status === 'cancelled') db.updateSubscription(saved.subscription_id, 'cancelled');
      res.json({ status: remote.status });
    } catch (err) {
      res.status(502).json({ error: 'cancellation_failed', message: 'Cancellation could not be confirmed. Please contact support.' });
    }
  });

  api.get('/billing/status', requireSession, (req, res) => {
    const ws = db.getWorkspace(req.session.userId);
    const indian=ws?.account.country==='IN'&&ws?.account.currency==='INR';
    const american=ws?.account.country==='US'&&ws?.account.currency==='USD';
    res.json({ planStatus:ws?.account.planStatus||'trial',trialDaysRemaining:ws?.account.trialDaysRemaining??15,monthlyPrice:indian?config.priceInPaise/100:config.priceCents/100,currency:indian?'INR':'USD',subscription:ws?.account.subscription||null,checkoutAvailable:Boolean((indian&&config.indiaSubscriptionsConfigured)||(american&&config.subscriptionsConfigured)) });
  });

  // Legacy order-based billing is intentionally disabled; it cannot auto-renew.
  api.post(['/billing/order','/billing/verify','/billing/simulate-test-payment'], requireSession, (req,res) => res.status(410).json({ error: 'legacy_billing_disabled' }));

  // Data Export & Account Deletion (Privacy compliance)
  api.get('/me/export', writeLimiter, requireSession, (req, res) => {
    const member = db.getMember(req.session.sub || (req.user && req.user.google_sub) || req.session.userId);
    const ws = db.getWorkspace(req.session.userId);
    const data = {
      exportedAt: new Date(now()).toISOString(),
      about: 'This is everything Cerium keeps about you.',
      signIn: { provider: req.session.sub ? 'Google' : 'Email', email: req.session.email, name: req.session.name },
      waitlist: member && { joinedAt: member.joinedAt, business: member.business, termsVersionAccepted: member.termsVersion },
      workspace: ws,
    };
    res.set('Content-Disposition', 'attachment; filename="cerium-my-data.json"');
    res.type('application/json').send(JSON.stringify(data, null, 2));
  });

  // Clear workspace data only
  api.delete('/me/data', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    db.clearWorkspaceData(req.session.userId);
    res.json({ cleared: true });
  });

  // Complete account and data deletion
  api.delete('/me', writeLimiter, sameOrigin, requireSession, requireCsrf, async (req, res) => {
    const subscription = db.getUserSubscription(req.session.userId);
    if (subscription && !['cancelled','expired','halted'].includes(subscription.status)) {
      try {
        const cancelled = await rzp.cancelSubscription(subscription.subscription_id, false);
        if (cancelled.status !== 'cancelled') return res.status(409).json({ error: 'cancel_subscription_first', message: 'Recurring billing could not be cancelled. Please cancel it in Settings before deleting your account.' });
        db.updateSubscription(subscription.subscription_id, 'cancelled');
      } catch {
        return res.status(502).json({ error: 'billing_cancellation_failed', message: 'Could not confirm cancellation of recurring charges. Your account has not been deleted.' });
      }
    }
    db.deleteAccount(req.session.sub || req.session.userId);
    res.clearCookie(config.sessionCookie, cookieBase);
    res.json({ deleted: true });
  });

  // Logout from /api/logout
  api.post('/logout', sameOrigin, (req, res) => {
    if (req.session) {
      if (!safeEqual(req.get('x-csrf-token') || '', req.session.csrfToken)) {
        return res.status(403).json({ error: 'bad_csrf' });
      }
      db.deleteSession(req.sessionToken);
    }
    res.clearCookie(config.sessionCookie, cookieBase);
    res.status(204).end();
  });

  // Waitlist legacy endpoint
  api.post('/waitlist', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    const sub = req.session.sub || req.session.userId;
    const { created } = db.joinWaitlist({
      sub,
      email: req.session.email,
      name: req.session.name,
      business: cleanText(req.body && req.body.business, 80),
      termsVersion: config.termsVersion,
      now: new Date(now()),
    });
    const member = db.getMember(sub);
    res.status(created ? 201 : 200).json({ member: member && { joinedAt: member.joinedAt, business: member.business } });
  });

  app.use('/api', api);

  // ------------------------------------------------------------ Admin Downloads
  app.get('/admin/waitlist.csv', requireAdmin(config), (req, res) => {
    const rows = db.listForExport();
    const lines = ['joined_at,name,email,business', ...rows.map((r) => [r.joinedAt, r.name, r.email, r.business].map(csvCell).join(','))];
    res.set('Content-Disposition', 'attachment; filename="cerium-waitlist.csv"');
    res.type('text/csv').send('\uFEFF' + lines.join('\r\n') + '\r\n');
  });

  // ------------------------------------------------------------ Not Found & Error Handling
  app.use((req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.status(404).sendFile(path.join(ROOT, 'public', '404.html'), (err) => {
      if (err) {
        res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>404 Not Found</title><p>Page not found. <a href="/">Return home</a>.</p>');
      }
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[error]', err && err.message);
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return res.status(status).json({ error: status === 500 ? 'server_error' : 'bad_request' });
    }
    res.status(status).type('text/plain').send(status === 500 ? 'Something went wrong.' : 'Bad request.');
  });

  return app;
}
