import crypto from 'crypto';

// Crockford-ish base32 without ambiguous chars (no I, L, O, U, 0, 1).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Cryptographically random verification code, e.g. "VST-7K4P-92XM". */
export function generateCode(): string {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join('');
  return `VST-${group()}-${group()}`;
}

/** 256-bit URL-safe session token (the raw secret — only ever returned once). */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** One-way hash for storage (codes + tokens are never stored in the clear). */
export function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time compare (used for admin token). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
