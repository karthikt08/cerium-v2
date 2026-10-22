// server/google.js
//
// Google OAuth 2.0 PKCE authentication client.

import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const pkceChallenge = (verifier) => createHash('sha256').update(verifier).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export class SignInError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.name = 'SignInError';
    this.code = code;
  }
}

function reason(err) {
  const oauthError = err && err.response && err.response.data && err.response.data.error;
  if (typeof oauthError === 'string' && /^[a-z_]{3,40}$/.test(oauthError)) return oauthError;
  const m = String((err && err.message) || '');
  if (/audience|recipient/i.test(m)) return 'wrong_audience';
  if (/issuer/i.test(m)) return 'wrong_issuer';
  if (/signature|No pem found|envelope/i.test(m)) return 'bad_signature';
  if (/too late|expired/i.test(m)) return 'token_expired';
  if (/too early|too far/i.test(m)) return 'token_time';
  return 'unknown';
}

export function createGoogle(config, client) {
  const redirectUri = `${config.baseUrl}/auth/google/callback`;
  const oauth =
    client ||
    new OAuth2Client({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri,
    });

  return {
    redirectUri,

    buildAuthUrl({ state, nonce, codeChallenge }) {
      const u = new URL(AUTH_URL);
      u.search = new URLSearchParams({
        client_id: config.googleClientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
        access_type: 'online',
      }).toString();
      return u.toString();
    },

    async verifyCode({ code, codeVerifier, nonce }) {
      let idToken;
      try {
        const { tokens } = await oauth.getToken({ code, codeVerifier });
        idToken = tokens && tokens.id_token;
      } catch (err) {
        throw new SignInError('failed', 'code exchange: ' + reason(err));
      }
      if (!idToken) throw new SignInError('failed', 'Google sent no ID token');

      let payload;
      try {
        const ticket = await oauth.verifyIdToken({ idToken, audience: config.googleClientId });
        payload = ticket.getPayload();
      } catch (err) {
        throw new SignInError('failed', 'ID token check: ' + reason(err));
      }

      if (!payload || typeof payload.sub !== 'string' || !payload.sub) throw new SignInError('failed', 'no sub');
      if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, nonce)) throw new SignInError('failed', 'nonce does not match');
      if (payload.email_verified !== true) throw new SignInError('unverified', 'email not verified');
      if (typeof payload.email !== 'string' || !payload.email.includes('@')) throw new SignInError('failed', 'no email');

      const email = payload.email.trim().toLowerCase().slice(0, 254);
      const name = String(payload.name || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200) || email.split('@')[0];
      return { sub: payload.sub.slice(0, 255), email, name };
    },
  };
}
