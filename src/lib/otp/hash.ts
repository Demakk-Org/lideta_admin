import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { OTP_HMAC_SECRET } from './config';

/** Generate a cryptographically strong numeric code of the given length. */
export function generateCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

/** HMAC-SHA256 of the plaintext code with the server secret. */
export function hashCode(code: string): string {
  return createHmac('sha256', OTP_HMAC_SECRET).update(code).digest('hex');
}

/** Constant-time comparison of a candidate code against a stored hash. */
export function verifyCodeHash(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCode(code), 'hex');
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  if (actual.length !== expected.length || actual.length === 0) return false;
  return timingSafeEqual(actual, expected);
}
