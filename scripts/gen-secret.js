// scripts/gen-secret.js
// Generates a cryptographically strong secret token.
import { randomBytes } from 'node:crypto';
console.log(randomBytes(48).toString('base64url'));
