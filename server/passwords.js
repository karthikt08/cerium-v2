// server/auth.js
//
// Authentication security helpers: password hashing with scrypt, token generation,
// timing-safe verification, and password policy enforcement.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const originalKey = Buffer.from(parts[2], 'hex');
  const keyToTest = scryptSync(password, salt, 64);
  if (originalKey.length !== keyToTest.length) return false;
  return timingSafeEqual(originalKey, keyToTest);
}

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one letter and one number.' };
  }
  return { ok: true };
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
