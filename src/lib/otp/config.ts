// Centralized configuration for the phone-OTP backend.
// Values come from environment variables (see docs/phone-otp-backend.md). Anything
// missing at request time is reported as a 500 by the routes rather than crashing
// the module at import.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const OTP_CONFIG = {
  ttlSeconds: intEnv('OTP_TTL_SECONDS', 300),
  length: intEnv('OTP_LENGTH', 6),
  maxAttempts: intEnv('OTP_MAX_ATTEMPTS', 5),
  resendCooldownSeconds: intEnv('OTP_RESEND_COOLDOWN', 60),
  hourlyCapPerNumber: intEnv('OTP_HOURLY_CAP_PER_NUMBER', 5),
  hourlyCapPerIp: intEnv('OTP_HOURLY_CAP_PER_IP', 20),
  // Server-side password policy for phone-based reset. 6 is Firebase Auth's own
  // minimum — raising it here would reject passwords the app may accept.
  passwordMinLength: intEnv('OTP_PASSWORD_MIN_LENGTH', 6),
  // GeezSMS requires the number to start with `2519…` (no leading `+`).
  stripPlus: (process.env.OTP_STRIP_PLUS ?? 'true') !== 'false',
} as const;

export const GEEZSMS_CONFIG = {
  url: process.env.GEEZ_SMS_URL || 'https://api.geezsms.com/api/v1/sms/send',
  token: process.env.GEEZ_SMS_TOKEN || '',
  // Optional custom shortcode / sender id from the GeezSMS dashboard.
  shortcodeId: process.env.GEEZ_SMS_SHORTCODE_ID || '',
} as const;

// Server secret used to HMAC the OTP code before storing it in Firestore.
export const OTP_HMAC_SECRET = process.env.OTP_HMAC_SECRET || '';

// Shared secret the mobile app must send in the `x-otp-app-secret` header on both
// endpoints (stand-in for Firebase App Check; swappable later).
export const OTP_REQUEST_SECRET = process.env.OTP_REQUEST_SECRET || '';

// App name interpolated into the localized SMS body.
export const APP_NAME = process.env.OTP_APP_NAME || 'Lideta';

/** Returns a human-readable list of missing required env vars, or [] when configured. */
export function missingCoreConfig(): string[] {
  const missing: string[] = [];
  if (!OTP_HMAC_SECRET) missing.push('OTP_HMAC_SECRET');
  if (!OTP_REQUEST_SECRET) missing.push('OTP_REQUEST_SECRET');
  return missing;
}
