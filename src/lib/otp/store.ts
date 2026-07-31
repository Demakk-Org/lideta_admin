import { Timestamp } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase/admin';
import { OTP_CONFIG } from './config';
import { verifyCodeHash } from './hash';

const OTP_COLLECTION = 'otp_requests';
const RATE_LIMIT_COLLECTION = 'otp_rate_limits';

export type OtpPurpose = 'auth' | 'link' | 'reset';

export interface OtpRecord {
  phone_number: string;
  code_hash: string;
  purpose: OtpPurpose;
  link_uid: string | null;
  lang: string; // language the OTP was requested in ("en" | "am" | "om")
  attempts: number;
  send_count: number;
  ip: string | null;
  created_at: Timestamp;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: 'cooldown' | 'number_cap' | 'ip_cap';
  resendAfterSeconds?: number;
}

const HOUR_MS = 3600 * 1000;

/**
 * Atomically enforce the resend cooldown + hourly caps (per-number and per-IP) and
 * record this send. Counters live in `otp_rate_limits/{phone:…|ip:…}` so no composite
 * indexes are needed. Note: a send that later fails at GeezSMS still counts against the
 * caps — deliberately conservative so forced failures can't be used to bypass limits.
 *
 * `scope` keeps password-reset sends in their own buckets (`reset:phone:…`) so reset
 * requests are tracked/limited separately from auth (spec §17.1).
 */
export async function checkAndRecordSend(
  phoneNumber: string,
  ip: string | null,
  scope: 'auth' | 'reset' = 'auth',
): Promise<RateLimitResult> {
  const prefix = scope === 'reset' ? 'reset:' : '';
  const phoneRef = adminDb.collection(RATE_LIMIT_COLLECTION).doc(`${prefix}phone:${phoneNumber}`);
  const ipRef = ip ? adminDb.collection(RATE_LIMIT_COLLECTION).doc(`${prefix}ip:${ip}`) : null;
  const cooldownMs = OTP_CONFIG.resendCooldownSeconds * 1000;

  return adminDb.runTransaction(async (tx) => {
    const nowMs = Date.now();

    // All reads must precede all writes in a Firestore transaction.
    const phoneSnap = await tx.get(phoneRef);
    const ipSnap = ipRef ? await tx.get(ipRef) : null;

    const p = phoneSnap.exists ? phoneSnap.data() : null;

    // 1) Resend cooldown for this number.
    if (p) {
      const elapsed = nowMs - (p.lastSentAt as Timestamp).toMillis();
      if (elapsed < cooldownMs) {
        return {
          allowed: false,
          reason: 'cooldown',
          resendAfterSeconds: Math.ceil((cooldownMs - elapsed) / 1000),
        };
      }
    }

    // 2) Hourly cap for this number.
    let phoneCount = 1;
    let phoneWindowStartMs = nowMs;
    if (p) {
      const windowStartMs = (p.windowStart as Timestamp).toMillis();
      const inWindow = nowMs - windowStartMs < HOUR_MS;
      if (inWindow) {
        if ((p.count as number) >= OTP_CONFIG.hourlyCapPerNumber) {
          return {
            allowed: false,
            reason: 'number_cap',
            resendAfterSeconds: Math.ceil((HOUR_MS - (nowMs - windowStartMs)) / 1000),
          };
        }
        phoneCount = (p.count as number) + 1;
        phoneWindowStartMs = windowStartMs;
      }
    }

    // 3) Hourly cap for this IP.
    let ipCount = 1;
    let ipWindowStartMs = nowMs;
    if (ipSnap && ipSnap.exists) {
      const d = ipSnap.data()!;
      const windowStartMs = (d.windowStart as Timestamp).toMillis();
      const inWindow = nowMs - windowStartMs < HOUR_MS;
      if (inWindow) {
        if ((d.count as number) >= OTP_CONFIG.hourlyCapPerIp) {
          return {
            allowed: false,
            reason: 'ip_cap',
            resendAfterSeconds: Math.ceil((HOUR_MS - (nowMs - windowStartMs)) / 1000),
          };
        }
        ipCount = (d.count as number) + 1;
        ipWindowStartMs = windowStartMs;
      }
    }

    const nowTs = Timestamp.fromMillis(nowMs);
    tx.set(phoneRef, {
      count: phoneCount,
      windowStart: Timestamp.fromMillis(phoneWindowStartMs),
      lastSentAt: nowTs,
    });
    if (ipRef) {
      tx.set(ipRef, {
        count: ipCount,
        windowStart: Timestamp.fromMillis(ipWindowStartMs),
        lastSentAt: nowTs,
      });
    }

    return { allowed: true };
  });
}

/**
 * Store a new OTP request and supersede any outstanding (un-consumed) codes for the
 * same number (latest-wins). Returns the generated requestId.
 */
export async function createOtpRequest(params: {
  phoneNumber: string;
  codeHash: string;
  purpose: OtpPurpose;
  linkUid: string | null;
  lang: string;
  ip: string | null;
}): Promise<string> {
  const now = Timestamp.now();
  const expires = Timestamp.fromMillis(now.toMillis() + OTP_CONFIG.ttlSeconds * 1000);

  // Equality-only filters — no composite index required.
  const outstanding = await adminDb
    .collection(OTP_COLLECTION)
    .where('phone_number', '==', params.phoneNumber)
    .where('consumed_at', '==', null)
    .get();

  const batch = adminDb.batch();
  outstanding.docs.forEach((d) => batch.update(d.ref, { consumed_at: now }));

  const ref = adminDb.collection(OTP_COLLECTION).doc();
  const record: OtpRecord = {
    phone_number: params.phoneNumber,
    code_hash: params.codeHash,
    purpose: params.purpose,
    link_uid: params.linkUid,
    lang: params.lang,
    attempts: 0,
    send_count: 1,
    ip: params.ip,
    created_at: now,
    expires_at: expires,
    consumed_at: null,
  };
  batch.set(ref, record);
  await batch.commit();
  return ref.id;
}

// Discriminated result of a verify attempt. `ok` carries the record so the caller
// can run the (non-Firestore) Firebase Auth identity step outside the transaction.
export type VerifyOutcome =
  | { kind: 'not_found' }
  | { kind: 'phone_mismatch'; storedPhone: string }
  | { kind: 'consumed' }
  | { kind: 'expired'; expiredAgoMs: number }
  | { kind: 'too_many'; attempts: number }
  | { kind: 'wrong'; attempts: number }
  | { kind: 'locked_out'; attempts: number }
  | { kind: 'ok'; data: OtpRecord };

/**
 * Atomically verify a submitted code and, on the same transaction, either count the
 * failed attempt (locking out at the cap) or — when `consume` is true — consume the
 * code on success. Running the read + attempt-check + compare + write in one
 * transaction is what makes the attempt limit and single-use guarantee hold under
 * concurrent verify requests — without it, many parallel guesses all read
 * `attempts:0` and bypass the cap.
 *
 * A wrong guess always counts (and locks out at the cap) regardless of `consume`, so
 * a non-consuming check is not a brute-force bypass. `consume:false` differs only on
 * a *correct* code: it validates without spending the single use, which lets a
 * two-step reset UI confirm the code on one screen and still redeem it on the next.
 */
async function runVerify(
  requestId: string,
  phoneNumber: string,
  code: string,
  consume: boolean,
): Promise<VerifyOutcome> {
  const ref = adminDb.collection(OTP_COLLECTION).doc(requestId);
  const max = OTP_CONFIG.maxAttempts;

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: 'not_found' } as VerifyOutcome;

    const data = snap.data() as OtpRecord;
    const now = Timestamp.now();
    const nowMs = now.toMillis();

    if (data.phone_number !== phoneNumber) {
      return { kind: 'phone_mismatch', storedPhone: data.phone_number };
    }
    if (data.consumed_at) return { kind: 'consumed' };
    if (data.expires_at.toMillis() < nowMs) {
      return { kind: 'expired', expiredAgoMs: nowMs - data.expires_at.toMillis() };
    }
    if (data.attempts >= max) {
      tx.update(ref, { consumed_at: now });
      return { kind: 'too_many', attempts: data.attempts };
    }

    // Wrong code → count the attempt, invalidating on the last one. This happens
    // even in check mode so repeated wrong guesses still exhaust the cap.
    if (!verifyCodeHash(code, data.code_hash)) {
      const attempts = data.attempts + 1;
      if (attempts >= max) {
        tx.update(ref, { attempts, consumed_at: now });
        return { kind: 'locked_out', attempts };
      }
      tx.update(ref, { attempts });
      return { kind: 'wrong', attempts };
    }

    // Correct — consume (single use) only when asked; a check leaves it redeemable.
    if (consume) tx.update(ref, { consumed_at: now });
    return { kind: 'ok', data };
  });
}

/** Verify a code and consume it (single use) on success. */
export function verifyAndConsumeOtp(
  requestId: string,
  phoneNumber: string,
  code: string,
): Promise<VerifyOutcome> {
  return runVerify(requestId, phoneNumber, code, true);
}

/**
 * Verify a code WITHOUT consuming it on success — for a "confirm the code" screen
 * that precedes a separate redeeming call (e.g. the two-step phone-reset UI). Wrong
 * guesses still count against the attempt cap; only the correct code is left unspent.
 */
export function checkOtp(
  requestId: string,
  phoneNumber: string,
  code: string,
): Promise<VerifyOutcome> {
  return runVerify(requestId, phoneNumber, code, false);
}
