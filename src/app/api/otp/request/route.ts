import { NextRequest, NextResponse } from 'next/server';

import { adminAuth } from '@/lib/firebase/admin';
import {
  GEEZSMS_CONFIG,
  OTP_CONFIG,
  OTP_REQUEST_SECRET,
  missingCoreConfig,
} from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { sendSmsWithRetry, SmsSendError } from '@/lib/otp/geezsms';
import { generateCode, hashCode } from '@/lib/otp/hash';
import { makeOtpLogger } from '@/lib/otp/log';
import { normalizeLang, otpMessage } from '@/lib/otp/messages';
import { isValidE164, toGeezSmsPhone } from '@/lib/otp/phone';
import {
  checkAndRecordSend,
  createOtpRequest,
  type OtpPurpose,
} from '@/lib/otp/store';
import { phoneAccountExists, phoneOwnerUid } from '@/lib/otp/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const log = makeOtpLogger('otp/request', crypto.randomUUID());

  const missing = missingCoreConfig();
  if (missing.length || !GEEZSMS_CONFIG.token) {
    log.error('config_missing', {
      missing: [
        ...missing,
        ...(GEEZSMS_CONFIG.token ? [] : ['GEEZ_SMS_TOKEN']),
      ],
    });
    return errorResponse(500, 'server_error', 'OTP backend is not configured');
  }

  // Shared secret (stand-in for Firebase App Check).
  const appSecret = req.headers.get('x-otp-app-secret');
  if (!appSecret || appSecret !== OTP_REQUEST_SECRET) {
    log.warn('unauthorized', {
      reason: appSecret ? 'wrong_secret' : 'missing_secret',
    });
    return errorResponse(401, 'unauthorized', 'Missing or invalid app secret');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    log.warn('invalid_json');
    return errorResponse(400, 'invalid_request', 'Invalid JSON body');
  }

  const phoneNumber = String(body.phoneNumber ?? '').trim();
  const purpose: OtpPurpose =
    body.purpose === 'link' ||
    body.purpose === 'reset' ||
    body.purpose === 'signup'
      ? body.purpose
      : 'auth';
  const lang = normalizeLang(body.lang);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  log.info('incoming', {
    phoneNumber,
    purpose,
    lang,
    ip,
    hasIdToken: Boolean(body.idToken),
  });

  if (!isValidE164(phoneNumber)) {
    log.warn('invalid_phone', { phoneNumber });
    return errorResponse(
      400,
      'invalid_phone',
      'phoneNumber must be E.164 (e.g. +2519…)',
    );
  }

  // purpose:"link" attaches the phone to an already-signed-in account.
  let linkUid: string | null = null;
  if (purpose === 'link') {
    const idToken = String(body.idToken ?? '');
    if (!idToken) {
      log.warn('link_idtoken_missing', { phoneNumber });
      return errorResponse(
        401,
        'unauthorized',
        'idToken is required for purpose "link"',
      );
    }
    try {
      linkUid = (await adminAuth.verifyIdToken(idToken)).uid;
      log.info('link_idtoken_ok', { phoneNumber, uid: linkUid });
    } catch (e) {
      log.warn('link_idtoken_invalid', {
        phoneNumber,
        error: (e as Error).message,
      });
      return errorResponse(401, 'unauthorized', 'Invalid idToken');
    }
  }

  // Rate limiting: resend cooldown + hourly caps (per-number and per-IP).
  // Reset requests are tracked in their own buckets, separate from auth (§17.1).
  const rl = await checkAndRecordSend(
    phoneNumber,
    ip,
    purpose === 'reset' ? 'reset' : 'auth',
  );
  if (!rl.allowed) {
    log.warn('rate_limited', {
      phoneNumber,
      reason: rl.reason,
      resendAfterSeconds: rl.resendAfterSeconds,
    });
    return errorResponse(429, 'rate_limited', `Rate limited (${rl.reason})`, {
      resendAfterSeconds:
        rl.resendAfterSeconds ?? OTP_CONFIG.resendCooldownSeconds,
    });
  }

  // purpose:"signup" is an explicit create-only intent: if the number already has an
  // account, fail before any SMS is sent, any GeezSMS balance is spent, or any OTP
  // record is written. Deliberately placed *after* checkAndRecordSend so a rejected
  // signup still counts against the per-phone/per-IP quotas — otherwise this branch
  // would be a free, unlimited "is this number registered?" oracle.
  if (purpose === 'signup') {
    let exists: boolean;
    try {
      exists = await phoneAccountExists(phoneNumber);
    } catch (e) {
      log.error('signup_lookup_failed', {
        phoneNumber,
        error: (e as Error).message,
      });
      return errorResponse(500, 'server_error', 'Failed to check phone number');
    }
    if (exists) {
      log.warn('account_exists', { phoneNumber, purpose });
      return errorResponse(
        409,
        'account_exists',
        'An account already exists for this phone number.',
      );
    }
  }

  if (purpose === 'link' && linkUid) {
    let ownerUid: string | null;
    try {
      ownerUid = await phoneOwnerUid(phoneNumber);
    } catch (e) {
      log.error('link_lookup_failed', {
        phoneNumber,
        error: (e as Error).message,
      });
      return errorResponse(500, 'server_error', 'Failed to check phone number');
    }
    // Re-verifying your own number is allowed; only another owner is a clash.
    if (ownerUid !== null && ownerUid !== linkUid) {
      log.warn('phone_in_use', { phoneNumber, callerUid: linkUid, ownerUid });
      return errorResponse(
        409,
        'phone_in_use',
        'Phone number already in use by another account',
      );
    }
  }

  // Generate + persist (hash only), superseding any outstanding code for this number.
  const code = generateCode(OTP_CONFIG.length);
  let requestId: string;
  try {
    requestId = await createOtpRequest({
      phoneNumber,
      codeHash: hashCode(code),
      purpose,
      linkUid,
      lang,
      ip,
    });
  } catch (e) {
    log.error('store_write_failed', {
      phoneNumber,
      error: (e as Error).message,
    });
    return errorResponse(500, 'server_error', 'Failed to store OTP request');
  }
  log.info('otp_stored', { phoneNumber, requestId, purpose });

  // Deliver via GeezSMS.
  const geezPhone = toGeezSmsPhone(phoneNumber, OTP_CONFIG.stripPlus);
  let sms;
  try {
    sms = await sendSmsWithRetry(geezPhone, otpMessage(code, lang), code);
  } catch (e) {
    const transient = e instanceof SmsSendError && e.transient;
    log.error('sms_send_failed', {
      phoneNumber,
      geezPhone,
      requestId,
      transient,
      httpStatus: transient ? 503 : 502,
      error: (e as Error).message,
      // Redacted GeezSMS body — the actual rejection reason (bad number,
      // insufficient balance, unrecognized request, …).
      geezResponse: e instanceof SmsSendError ? e.responseBody : null,
    });
    return errorResponse(
      transient ? 503 : 502,
      'sms_send_failed',
      'Failed to send SMS',
    );
  }

  // `geezMessageId` is the dashboard's ID column — the only way to match one of our
  // requests to a row there. NB: this line means GeezSMS *accepted* the message, not
  // that it was delivered; the dashboard can still flip it to Failed afterwards, and
  // we get no callback for that.
  log.info('otp_sent', {
    phoneNumber,
    geezPhone,
    requestId,
    purpose,
    lang,
    geezMessageId: sms.messageId,
    geezAttempts: sms.attempts,
    geezResponse: sms.responseBody,
  });

  // Privacy: for "auth"/"reset"/"link", always 200 regardless of whether an account
  // exists for this number. Only "signup" (handled above) reveals existence.
  return NextResponse.json({
    requestId,
    expiresInSeconds: OTP_CONFIG.ttlSeconds,
    resendAfterSeconds: OTP_CONFIG.resendCooldownSeconds,
  });
}
