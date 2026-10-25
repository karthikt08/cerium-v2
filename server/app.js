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
import {makePhoneVerifier,normalizeBillingPhone,maskBillingPhone} from './billing-identity.js';
import {validCountry,matchesBillingCurrency} from '../public/js/countries.js';
import {verifyOptOut} from './reminders.js';
import {createRegionGate} from './region-access.js';
import {makeTrialSchedule,safeTrialSchedule,safeSubscriptionSchedule} from './trial-timing.js';
import {lineItemsTotal,lineItemsRoundingAdjustment} from '../public/js/money.js';
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

export function createApp({ config, db, google = null, razorpay = null, phoneVerifier = null, accountEmailSender = null, regionLookup = undefined, now = () => Date.now(), limits = {}, log = true }) {
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
  const phones = phoneVerifier || makePhoneVerifier(config);
  const billingInFlight=new Set();
  const withBillingLock=handler=>async(req,res,next)=>{
    const id=req.session.userId;
    if(billingInFlight.has(id))return res.status(409).json({error:'billing_in_progress',message:'Another billing change is in progress. Please wait and retry.'});
    billingInFlight.add(id);
    try {await handler(req,res,next);} finally {billingInFlight.delete(id);}
  };

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

  // A late or mismatched provider schedule must never unlock an early
  // recurring debit. Attempt immediate cancellation before responding.
  async function cancelUnsafeSubscription(id) {
    try {
      const cancelled=await rzp.cancelSubscription(id,false);
      if(cancelled?.status!=='cancelled')return false;
      db.updateSubscription(id,'cancelled');
      return true;
    }catch(err){
      console.error('[billing] unsafe subscription cancellation requires urgent manual review:',id,err?.message);
      return false;
    }
  }

  // ------------------------------------------------------------ Razorpay Webhooks (Raw Body)
  app.post(
    '/webhooks/razorpay',
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (req, res) => {
      const signature = req.get('x-razorpay-signature');
      if (!rzp.verifyWebhook(req.body, signature)) {
        return res.status(400).json({ error: 'invalid_signature' });
      }
      try {
        const event = JSON.parse(req.body.toString('utf8'));
        const subscription = event.payload?.subscription?.entity;
        if (subscription && typeof subscription.id === 'string' && subscription.id.startsWith('sub_')) {
          const status = String(subscription.status || '');
          const allowed = ['authenticated','active','charged','pending','halted','paused','cancelled','expired','completed'];
          if (allowed.includes(status)) {
            const normalized = status === 'completed' ? 'expired' : status;
            const savedSub=db.getSubscription(subscription.id);
            if(savedSub) {
              const verified=db.billingEligible(savedSub.user_id);
              const authorizationAt=Date.now();
              const alreadyAuthorized=Number(db.getBillingIdentity(savedSub.user_id)?.mandate_authorized_at)>0;
              if(config.workspaceAccessMode==='phone_and_mandate' &&
                ['authenticated','active','charged'].includes(normalized) &&
                !alreadyAuthorized &&
                (!verified || !db.businessProfileComplete(savedSub.user_id) || !safeTrialSchedule(subscription,savedSub.start_at,authorizationAt))) {
                const cancelled=await cancelUnsafeSubscription(subscription.id);
                if(!cancelled)return res.status(503).json({error:'unsafe_billing_schedule'});
                return res.json({status:'cancelled_for_trial_safety'});
              }
              const updated=db.updateSubscription(subscription.id, normalized, Number(subscription.current_end) ? subscription.current_end * 1000 : null,
                Number.isSafeInteger(event.created_at)&&event.created_at>0?event.created_at*1000:0);
              if(updated&&db.getUserSubscription(savedSub.user_id)?.subscription_id===subscription.id&&config.workspaceAccessMode==='phone_and_mandate' &&
                 ['authenticated','active','charged'].includes(normalized)&&verified&&db.businessProfileComplete(savedSub.user_id)&&!alreadyAuthorized)
                db.beginTrialOnEntry(savedSub.user_id,authorizationAt,savedSub.start_at*1000);
            }
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

  // ------------------------------------------------------------ Parsers & Session Loading
  app.use(cookieParser());
  // Business documents support 20 line items plus notes, including UTF-8 text.
  // Keep the smaller cap on authentication and simple public forms.
  app.use(['/api/invoices','/api/quotes','/api/jobs','/api/leads','/api/followups','/api/reviews','/api/messages','/api/me'], express.json({ limit: '64kb' }));
  app.use(express.json({ limit: '2kb' }));
  app.use(express.urlencoded({ extended: false, limit: '2kb' }));
  app.use(loadSession(db, config));
  // Apply before static pages, sign-in endpoints, workspace routes and billing.
  // Verified provider webhooks, uptime checks and opt-outs remain reachable.
  app.use(createRegionGate({config,...(regionLookup?{lookup:regionLookup}:{})}));

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
        '</td><td>'+escapeQuoteHtml(money(lineItemsTotal([i])))+'</td></tr>').join('');
      const token=escapeQuoteHtml(req.query.token);
      const rounding=lineItemsRoundingAdjustment(quote.items,quote.total);
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
        rows+'</tbody></table>'+
        (rounding?'<p class="meta">Rounding adjustment '+escapeQuoteHtml(money(rounding))+'</p>':'')+
        '<div class="total">Total '+escapeQuoteHtml(money(quote.total))+'</div>'+
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
  // Enforce onboarding BEFORE delivering the private workspace shell.
  // Never rely on hiding buttons: the private API has the same gate below.
  const accessStatus=userId=>{
    const verified=db.billingEligible(userId);
    const businessComplete=db.businessProfileComplete(userId);
    const receipt=db.getBillingIdentity(userId);
    // Once authorized, a cancelled mandate should not end the already granted
    // free trial. Trial expiry still makes business writes read-only.
    const mandate=Boolean(receipt?.mandate_authorized_at>0);
    const mode=config.workspaceAccessMode;
    return {verified,businessComplete,mandate,unlocked:mode==='off'||(verified&&businessComplete&&(mode==='phone'||mandate))};
  };
  app.use((req,res,next)=>{
    if(!['GET','HEAD'].includes(req.method))return next();
    let pathname;
    try{pathname=path.posix.normalize(decodeURIComponent(req.path).replaceAll('\\','/')).toLowerCase().replace(/\/+$/,'');}
    catch{return res.status(400).type('text/plain').send('Invalid URL.');}
    if(!['/app','/app.html'].includes(pathname))return next();
    // Static serving decodes URLs and Windows file names ignore case. Guard the
    // resolved shell too, rather than only the literal /app.html route.
    res.set('Cache-Control','no-store');
    if(!req.session){
      const target=workspaceReturnTarget(req.originalUrl)||'/app.html'+new URL(req.originalUrl,config.baseUrl).search;
      return res.redirect(303,`/login.html?returnTo=${encodeURIComponent(target)}`);
    }
    if(!accessStatus(req.session.userId).unlocked)return res.redirect(303,'/verify.html');
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

    const user = db.createUser({
      email: cleanEmail,
      passwordHash,
      name: cleanName,
      businessName: cleanBusiness,
      termsVersion: config.termsVersion,
      country: req.region?.country || 'US',
      emailVerified: 0,
      verificationToken,
      verificationExpires,
      now: now(),
    });

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
    if(config.isProd&&!accountEmailSender)return res.status(503).json({error:'email_not_configured',
      message:'Password reset email delivery is unavailable. Please contact CERIUM support.'});

    if (cleanEmail) {
      const user = db.getUserByEmail(cleanEmail);
      if (user) {
        const token = generateToken(32);
        const expiresAt = now() + 60 * MINUTE;
        db.setResetToken(user.id, token, expiresAt);
        if(accountEmailSender){
          try {
            await accountEmailSender({to:user.email,subject:'Reset your CERIUM password',
              body:'Use this link to reset your CERIUM password. It expires in one hour:\n\n'+
                config.baseUrl+'/reset-password.html?token='+encodeURIComponent(token)+
                '\n\nIf you did not request this, you can ignore this email.'});
          } catch {
            return res.status(502).json({error:'email_delivery_failed',message:'We could not confirm delivery of the reset email. Please try again later.'});
          }
        }
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

    const note = sign(config.sessionSecret, { s: state, n: nonce, v: verifier, i: intent, b: business, r: returnTo, country: req.region?.country || null, e: now() + LOGIN_TIME });
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
    // The callback may occur from a different network. Only new accounts require an approved region.
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
    if(user){
      user=db.linkVerifiedGoogleIdentity(user.id,profile.sub);
      if(!user)return fail('invalid');
    }
    if (!user) {
      if(config.regionEnforced && config.workspaceAccessMode==='off' &&
         (!req.region || !note.country || note.country!==req.region.country)) return fail('region-unavailable');
      user = db.createUser({
        email: profile.email,
        name: profile.name,
        businessName: note.b || '',
        googleSub: profile.sub,
        emailVerified: 1,
        termsVersion: config.termsVersion,
        country: req.region?.country || 'US',
        now: now(),
      });
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

  // Public, server-verified market selection; deliberately excludes visitor IP.
  api.get('/region', (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(!req.region)return res.json({mode:config.regionEnforced?'unavailable':'development',country:null,currency:null,monthlyPrice:null,reason:req.regionIssue?.reason||null});
    const {country,currency,monthlyPrice}=req.region;
    return res.json({mode:'enforced',country,currency,monthlyPrice});
  });

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

  // Protect all workspace APIs, not just the page. Billing/onboarding,
  // account deletion and data export remain accessible while gated.
  api.use((req,res,next)=>{
    if(!req.session || config.workspaceAccessMode==='off')return next();
    if(accessStatus(req.session.userId).unlocked)return next();
    const permitted=[
      /^\/billing\/identity(?:\/start|\/verify)?$/,
      /^\/billing\/(?:status|subscription(?:\/verify|\/cancel)?)$/,
      /^\/business\/(?:profile|setup(?:\/complete)?)$/,
      /^\/logout$/,
      /^\/me\/export$/,
      /^\/me$/
    ];
    if(permitted.some(re=>re.test(req.path)) && !(req.path==='/me'&&req.method!=='GET'))return next();
    if(req.path==='/me'&&req.method==='DELETE')return next();
    return res.status(403).json({error:'onboarding_required',message:'Verify your phone, complete business setup'+(config.workspaceAccessMode==='phone_and_mandate'?', and authorize your payment method':'')+' before accessing CERIUM.'});
  });

  api.get('/business/profile',requireSession,(req,res)=>{
    res.set('Cache-Control','no-store');
    return res.json(db.getBusinessProfile(req.session.userId));
  });
  api.get('/business/setup',requireSession,(req,res)=>res.json(db.getBusinessSetup(req.session.userId)));
  const requireBusinessPhone=(req,res,next)=>db.billingEligible(req.session.userId)?next():res.status(409).json({error:'phone_verification_required',message:'Verify your phone before business setup.'});
  const setupError=(err,res)=>{
    if(err.code==='invalid_business_profile')return res.status(400).json({error:err.code,message:err.message,fields:err.fields});
    throw err;
  };
  api.post('/business/setup',writeLimiter,sameOrigin,requireSession,requireCsrf,requireBusinessPhone,(req,res)=>{
    try{return res.json(db.saveBusinessSetupStep(req.session.userId,req.body?.step,req.body?.fields));}
    catch(err){return setupError(err,res);}
  });
  api.post('/business/setup/complete',writeLimiter,sameOrigin,requireSession,requireCsrf,requireBusinessPhone,(req,res)=>{
    try{
      const profile=db.completeBusinessSetup(req.session.userId,req.body?.confirmBusinessDetails);
      if(config.workspaceAccessMode==='phone')db.beginTrialOnEntry(req.session.userId);
      return res.json({ok:true,profile,workspaceUnlocked:accessStatus(req.session.userId).unlocked});
    }catch(err){return setupError(err,res);}
  });
  api.post('/business/profile',writeLimiter,sameOrigin,requireSession,requireCsrf,(req,res)=>{
    if(!db.billingEligible(req.session.userId))return res.status(409).json({error:'phone_verification_required',message:'Verify your phone before completing business setup.'});
    try{
      const profile=db.saveBusinessProfile(req.session.userId,req.body);
      if(config.workspaceAccessMode==='phone')db.beginTrialOnEntry(req.session.userId);
      return res.json({ok:true,profile,workspaceUnlocked:accessStatus(req.session.userId).unlocked});
    }catch(err){
      if(err.code==='invalid_business_profile')return res.status(400).json({error:err.code,message:err.message,fields:err.fields});
      throw err;
    }
  });

  // Update profile
  api.patch('/me', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    let updated;
    if((config.regionEnforced||config.workspaceAccessMode!=='off') && req.body?.country && req.body.country!==(req.user?.country||'US'))
      return res.status(403).json({error:'region_locked',message:'The edition is chosen from your verified connection. Contact support to review account region changes.'});
    const body=config.regionEnforced?{...(req.body||{}),country:req.user.country,currency:req.user.currency}:(req.body||{});
    try { updated = db.updateUser(req.session.userId, body); }
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
    // Region restrictions are server-enforced; disable edition selection in UI.
    res.json({...ws,account:{...ws.account,regionLocked:config.regionEnforced||config.workspaceAccessMode!=='off'}});
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
    // Preserve historical denominations. New business records must match the
    // saved country's INR or USD edition; export remains available separately.
    if (!matchesBillingCurrency(workspace.account.country,workspace.account.currency)) {
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
  api.post('/jobs/:id/invoice', writeLimiter, sameOrigin, requireSession, requireCsrf, (req,res) => {
    try { res.status(201).json(db.createJobInvoice(req.session.userId,req.params.id)); }
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
    try { res.status(201).json(db.createInvoice(req.session.userId, req.body || {})); }
    catch(err) { scheduleError(res,err); }
  });

  api.patch('/invoices/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    try { db.updateInvoice(req.session.userId, req.params.id, req.body || {});res.json({ ok: true }); }
    catch(err) { scheduleError(res,err); }
  });

  api.patch('/invoices/:id/status', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    try { db.updateInvoiceStatus(req.session.userId, req.params.id, req.body?.status);res.json({ ok: true }); }
    catch(err) { scheduleError(res,err); }
  });

  api.delete('/invoices/:id', writeLimiter, sameOrigin, requireSession, requireCsrf, (req, res) => {
    try { res.json(db.deleteInvoice(req.session.userId, req.params.id)); }
    catch(err) { scheduleError(res,err); }
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

  // Billing identity: phone possession plus an explicit billing-country declaration.
  // SMS verification is deliberately AFTER trial signup and BEFORE any new paid
  // subscription. Phone codes are never accepted from profile fields or the browser.
  api.get('/billing/identity',requireSession,(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const saved=db.getBillingIdentity(req.session.userId);
    const user=db.getUserById(req.session.userId);
    const verified=db.billingEligible(req.session.userId);
    const pending=Boolean(saved?.pending_phone && saved.pending_expires_at>Date.now());
    const access=accessStatus(req.session.userId);
    res.json({
      country:user.country,currency:user.currency,verified,
      accessMode:config.workspaceAccessMode,
      paymentAuthorized:access.mandate,
      workspaceUnlocked:access.unlocked,
      businessComplete:access.businessComplete,businessProfile:db.getBusinessProfile(req.session.userId),
      subscriptionStatus:db.getUserSubscription(req.session.userId)?.status||null,
      checkoutConfigured:Boolean(user.country==='IN'?config.indiaSubscriptionsConfigured:config.subscriptionsConfigured),
      countryAttested:verified,
      phoneMasked:verified?maskBillingPhone(saved.phone_e164):'',
      pending,pendingCountry:pending?saved.pending_country:null,
      providerReady:Boolean(phones.ready),
      mode:phones.mode==='development'?'development':phones.ready?'sms':'unavailable',
      // Dial prefixes identify phone routing only, not residency or incorporation.
      note:'SMS confirms access to a number, not legal business location. Billing country is your declaration.'
    });
  });

  api.post('/billing/identity/start',authLimiter,sameOrigin,requireSession,requireCsrf,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const country=req.body?.declaredCountry;
    if(req.body?.confirmCountry!==true || !validCountry(country))
      return res.status(400).json({error:'country_confirmation_required',message:'Select and confirm the country where your business is based.'});
    const phone=normalizeBillingPhone(req.body?.phone,country);
    if(!phone)return res.status(400).json({error:'phone_invalid',message:'Enter a valid phone number for the selected country. National format or the full international number is accepted. Check the country selection if the number is from elsewhere.'});
    if(!phones.ready)return res.status(503).json({error:'sms_not_configured',message:'Phone verification is not available yet. Your free trial is unaffected; contact support.'});
    const claimed=db.beginBillingPhone(req.session.userId,phone,country);
    if(!claimed.ok){
      const messages={country_mismatch:'Saved billing country requires review.',cooldown:'You can request another code after 90 seconds.',daily_limit:'Daily SMS verification limit reached. Try again tomorrow or contact support.'};
      return res.status(claimed.reason==='country_mismatch'?409:429).json({error:claimed.reason,message:messages[claimed.reason]||'Verification is temporarily unavailable.'});
    }
    try{
      if(!(await phones.send(phone)))throw new Error('not pending');
      return res.json({ok:true,pending:true,country,phoneMasked:maskBillingPhone(phone),mode:phones.mode==='development'?'development':'sms'});
    }catch(err){
      return res.status(502).json({error:'sms_unavailable',message:'Could not send a code. No subscription was created. Try later or contact support.'});
    }
  });

  api.post('/billing/identity/verify',authLimiter,sameOrigin,requireSession,requireCsrf,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const code=req.body?.code;
    if(typeof code!=='string'||!/^[0-9]{4,10}$/.test(code))
      return res.status(400).json({error:'invalid_code',message:'Enter the numeric verification code.'});
    if(!phones.ready)return res.status(503).json({error:'sms_not_configured'});
    const claim=db.beginBillingCheck(req.session.userId);
    if(!claim.ok)return res.status(claim.reason==='attempt_limit'?429:409).json({
      error:claim.reason,message:claim.reason==='attempt_limit'?'Too many attempts. Request a new code later.':'No active verification. Request a new code.'
    });
    try{
      if(!(await phones.check(claim.phone,code)))
        return res.status(400).json({error:'invalid_code',message:'That code was not approved. Try again.'});
      if(!db.completeBillingPhone(req.session.userId,claim.phone,claim.country))
        return res.status(409).json({error:'verification_expired',message:'This code expired or your billing country changed.'});
      if(config.workspaceAccessMode==='phone'&&db.businessProfileComplete(req.session.userId))db.beginTrialOnEntry(req.session.userId);
      return res.json({ok:true,verified:true,phoneMasked:maskBillingPhone(claim.phone),country:claim.country,currency:claim.country==='IN'?'INR':'USD'});
    }catch{
      return res.status(502).json({error:'sms_unavailable',message:'Verification service is unavailable. Try again shortly.'});
    }
  });

  // Recurring subscription consent: a saved authorization is required before any automatic debit.
  api.post('/billing/subscription', writeLimiter, sameOrigin, requireSession, requireCsrf, withBillingLock(async (req, res) => {
    const user = db.getUserById(req.session.userId);
    if(config.workspaceAccessMode!=='off'&&!db.businessProfileComplete(user.id))
      return res.status(409).json({error:'business_profile_required',message:'Complete your business details before authorizing payment.'});
    const indian=user.country==='IN'&&user.currency==='INR';
    const international=user.country!=='IN'&&matchesBillingCurrency(user.country,user.currency);
    if(!indian&&!international)
      return res.status(403).json({error:'country_currency_mismatch',message:'Your workspace currency requires review before subscription checkout.'});
    const billingPlanId=indian?config.razorpayIndiaPlanId:config.razorpayPlanId;
    const billingAmount=indian?config.priceInPaise:config.priceCents;
    const billingCurrency=indian?'INR':'USD';
    if (!(indian?config.indiaSubscriptionsConfigured:config.subscriptionsConfigured))
      return res.status(503).json({error:'billing_not_configured',message:'Secure recurring payment authorization is not configured for this edition. The free trial cannot start until checkout is ready.'});
    const existing = db.getUserSubscription(user.id);
    const firstTrial=config.workspaceAccessMode==='phone_and_mandate'&&
      !user.onboarding_completed_at&&!Number(db.getBillingIdentity(user.id)?.mandate_authorized_at);
    if (existing && !['cancelled','expired'].includes(existing.status)) {
      if(['halted','paused'].includes(existing.status))return res.status(409).json({error:'cancel_subscription_first',message:'Cancel the previous subscription before starting another authorization.'});
      const authorizedBefore=Number(db.getBillingIdentity(user.id)?.mandate_authorized_at)>0;
      // An unapproved one-hour checkout cannot be reused indefinitely:
      // doing so could make its first scheduled debit less than 15 days away.
      if(firstTrial && !authorizedBefore &&
         existing.start_at*1000 < Date.now()+15*DAY) {
        try {
          const remote=await rzp.getSubscription(existing.subscription_id);
          if(['cancelled','expired'].includes(remote.status))
            db.updateSubscription(existing.subscription_id,remote.status);
          else if(!(await cancelUnsafeSubscription(existing.subscription_id)))
            return res.status(503).json({error:'billing_cancellation_unconfirmed',
              message:'The previous authorization window expired, but cancellation has not been confirmed. Contact support before retrying.'});
        }catch(err){
          console.error('[billing] stale checkout review required:',existing.subscription_id,err?.message);
          return res.status(503).json({error:'billing_cancellation_unconfirmed',
            message:'Unable to confirm cancellation of the previous authorization. Contact support before retrying.'});
        }
      } else {
        return res.json({ keyId: config.razorpayKeyId, subscriptionId: existing.subscription_id,
          status: existing.status, startAt:existing.start_at,
          amount:billingAmount,currency:billingCurrency,trialEligible:firstTrial });
      }
    }
    if(!phones.ready)return res.status(503).json({error:'sms_not_configured',message:'Phone and payment verification are required before trial entry. This checkout is temporarily unavailable.'});
    if(!db.billingEligible(user.id))
      return res.status(409).json({error:'billing_verification_required',message:'Verify your phone and confirm your business billing country before authorizing the trial payment method.'});
    try {
      // Razorpay fixes start_at at subscription creation. Bound authorization
      // to one hour and add the same hour to the scheduled first charge, so
      // approval at any permitted time guarantees AT LEAST 15 full days.
      const schedule=makeTrialSchedule();
      const existingTrialEnd=Number(user.trial_ends_at)||new Date(user.trial_started_at+'T00:00:00Z').getTime()+15*DAY;
      const startAt=firstTrial
        ?schedule.startAt
        :Math.max(Math.ceil(Date.now()/1000)+1800,Math.ceil(existingTrialEnd/1000),Math.ceil(Number(user.subscription_expires_at||0)/1000));
      const plan = await rzp.getPlan(billingPlanId);
      if (plan.period !== 'monthly' || Number(plan.interval) !== 1 ||
          Number(plan.item?.amount) !== billingAmount ||
          plan.item?.currency !== billingCurrency) {
        return res.status(503).json({ error: 'billing_plan_mismatch', message: 'Monthly price configuration does not match checkout. Contact support.' });
      }
      const created = await rzp.createSubscription({
        planId: billingPlanId, startAt,
        expireBy:firstTrial?schedule.expireBy:undefined,
        notes: { userId: user.id, edition: indian?'IN':'GLOBAL',country:user.country }
      });
      if (!created.id || !created.id.startsWith('sub_')) throw new Error('Missing subscription identifier');
      if(config.workspaceAccessMode==='phone_and_mandate' &&
         (firstTrial?(Number(created.expire_by)!==schedule.expireBy || !safeTrialSchedule(created,startAt)):
           !safeSubscriptionSchedule(created,startAt))){
        const cancelled=await rzp.cancelSubscription(created.id,false);
        if(cancelled?.status!=='cancelled')throw new Error('Unsafe provider schedule; cancellation not confirmed: '+created.id);
        return res.status(503).json({error:'billing_schedule_mismatch',message:'Could not confirm the full trial period. Please try again or contact support.'});
      }
      db.createSubscription(user.id, created.id, startAt);
      return res.json({ keyId: config.razorpayKeyId, subscriptionId: created.id, status: created.status,
        startAt, expireBy:firstTrial?schedule.expireBy:null,trialEligible:firstTrial,
        amount: billingAmount, currency: billingCurrency });
    } catch (err) {
      console.error('[billing] subscription creation failed:', err.message);
      return res.status(502).json({ error: 'billing_service_unavailable', message: 'Could not start subscription authorization. Please try again.' });
    }
  }));

  api.post('/billing/subscription/verify', writeLimiter, sameOrigin, requireSession, requireCsrf, withBillingLock(async (req, res) => {
    const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if(typeof razorpay_subscription_id!=='string'||!/^sub_[A-Za-z0-9_-]{1,100}$/.test(razorpay_subscription_id)||
       typeof razorpay_payment_id!=='string'||!razorpay_payment_id||razorpay_payment_id.length>200||
       typeof razorpay_signature!=='string'||!razorpay_signature||razorpay_signature.length>256)
      return res.status(400).json({error:'invalid_checkout',message:'The payment confirmation is incomplete or invalid.'});
    const saved = db.getSubscription(razorpay_subscription_id);
    if (!saved || saved.user_id !== req.session.userId) return res.status(404).json({ error: 'subscription_not_found' });
    if(['cancelled','expired'].includes(saved.status)||db.getUserSubscription(req.session.userId)?.subscription_id!==saved.subscription_id)
      return res.status(409).json({verified:false,error:'subscription_not_current',message:'This checkout is no longer current. Refresh your billing status.'});
    if (!rzp.verifySubscription({ subscriptionId: razorpay_subscription_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) return res.status(400).json({ error: 'invalid_signature' });
    try {
      const remote = await rzp.getSubscription(razorpay_subscription_id);
      const status = String(remote.status || '');
      const authorizationAt=Date.now();
      const alreadyAuthorized=Number(db.getBillingIdentity(req.session.userId)?.mandate_authorized_at)>0;
      if(config.workspaceAccessMode==='phone_and_mandate' &&
         ['authenticated','active','charged'].includes(status) && !alreadyAuthorized &&
         (!db.businessProfileComplete(req.session.userId)||!safeTrialSchedule(remote,saved.start_at,authorizationAt))) {
        const cancelled=await cancelUnsafeSubscription(saved.subscription_id);
        const missingBusiness=!db.businessProfileComplete(req.session.userId);
        return res.status(cancelled?409:503).json({
          verified:false,error:missingBusiness?'business_profile_required':'trial_schedule_unsafe',
          message:cancelled?(missingBusiness?'Complete business setup, then restart payment authorization.':'Authorization was too late to guarantee 15 full days. Restart checkout for a new safe trial date.'):'We could not confirm cancellation of an unsafe subscription. Contact CERIUM support before retrying.'
        });
      }
      if (['authenticated','active','pending','charged'].includes(status)) {
        if(!db.updateSubscription(saved.subscription_id, status, remote.current_end ? remote.current_end * 1000 : null))
          return res.status(409).json({verified:false,error:'subscription_not_current'});
        // A pending subscription has NOT completed recurring authorization.
        // Never return verified:true (or begin the trial) until Razorpay
        // confirms a mandate-authorized state.
        if (['authenticated','active','charged'].includes(status)) {
          if (config.workspaceAccessMode==='phone_and_mandate'&&db.billingEligible(req.session.userId)&&db.businessProfileComplete(req.session.userId)&&!alreadyAuthorized)
            db.beginTrialOnEntry(req.session.userId,authorizationAt,saved.start_at*1000);
          return res.json({ verified: true, status });
        }
      }
      return res.status(409).json({ verified: false, status, message: 'Razorpay has not confirmed recurring payment authorization yet. Check your payment app or retry later.' });
    } catch {
      return res.status(502).json({ error: 'billing_service_unavailable' });
    }
  }));

  api.post('/billing/subscription/cancel', writeLimiter, sameOrigin, requireSession, requireCsrf, withBillingLock(async (req, res) => {
    const saved = db.getUserSubscription(req.session.userId);
    if (!saved || ['cancelled','expired'].includes(saved.status)) return res.status(409).json({ error: 'no_active_subscription' });
    try {
      const remote = await rzp.cancelSubscription(saved.subscription_id, false);
      if(remote.status!=='cancelled')return res.status(409).json({error:'cancellation_unconfirmed',
        message:'The payment provider has not confirmed cancellation. Please retry or contact support.'});
      db.updateSubscription(saved.subscription_id, 'cancelled');
      res.json({ status: remote.status });
    } catch (err) {
      res.status(502).json({ error: 'cancellation_failed', message: 'Cancellation could not be confirmed. Please contact support.' });
    }
  }));

  api.get('/billing/status', requireSession, (req, res) => {
    const ws = db.getWorkspace(req.session.userId);
    const indian=ws?.account.country==='IN'&&ws?.account.currency==='INR';
    const international=ws?.account.country!=='IN'&&matchesBillingCurrency(ws?.account.country,ws?.account.currency);
    res.json({ planStatus:ws?.account.planStatus||'trial',trialDaysRemaining:ws?.account.trialDaysRemaining??15,monthlyPrice:indian?config.priceInPaise/100:config.priceCents/100,currency:indian?'INR':'USD',subscription:ws?.account.subscription||null,checkoutAvailable:Boolean(((indian&&config.indiaSubscriptionsConfigured)||(international&&config.subscriptionsConfigured))&&phones.ready&&db.billingEligible(req.session.userId)&&(config.workspaceAccessMode==='off'||db.businessProfileComplete(req.session.userId))),billingIdentityVerified:db.billingEligible(req.session.userId) });
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
      billingIdentity: db.getBillingIdentity(req.session.userId),
      businessSetup: db.getBusinessSetup(req.session.userId),
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
  api.delete('/me', writeLimiter, sameOrigin, requireSession, requireCsrf, withBillingLock(async (req, res) => {
    const subscriptions = db.getUserSubscriptions(req.session.userId);
    for (const subscription of subscriptions.filter(s=>!['cancelled','expired'].includes(s.status))) {
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
  }));

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
      if(status===400&&err.code==='invalid_record')return res.status(400).json({error:err.code,message:err.message});
      return res.status(status).json({ error: status === 500 ? 'server_error' : 'bad_request' });
    }
    res.status(status).type('text/plain').send(status === 500 ? 'Something went wrong.' : 'Bad request.');
  });

  return app;
}
