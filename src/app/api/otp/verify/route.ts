import { NextRequest, NextResponse } from 'next/server';

import { adminAuth } from '@/lib/firebase/admin';
import { OTP_REQUEST_SECRET, missingCoreConfig } from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { makeOtpLogger } from '@/lib/otp/log';
import { verifyAndConsumeOtp } from '@/lib/otp/store';
import { isUserNotFound, phoneAccountExists } from '@/lib/otp/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const log = makeOtpLogger('otp/verify', crypto.randomUUID());

  if (missingCoreConfig().length) {
    log.error('config_missing', { missing: missingCoreConfig() });
    return errorResponse(500, 'server_error', 'OTP backend is not configured');
  }

  const appSecret = req.headers.get('x-otp-app-secret');
  if (!appSecret || appSecret !== OTP_REQUEST_SECRET) {
    log.warn('unauthorized', { reason: appSecret ? 'wrong_secret' : 'missing_secret' });
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
  const code = String(body.code ?? '').trim();
  const requestId = String(body.requestId ?? '').trim();

  log.info('incoming', {
    phoneNumber,
    requestId,
    codeLen: code.length,
    hasIdToken: Boolean(body.idToken),
  });

  if (!phoneNumber || !code || !requestId) {
    log.warn('invalid_request', {
      hasPhone: Boolean(phoneNumber),
      hasCode: Boolean(code),
      hasRequestId: Boolean(requestId),
    });
    return errorResponse(400, 'invalid_request', 'phoneNumber, code and requestId are required');
  }

  // Atomic: read + attempt-check + compare + increment/consume in one transaction so
  // the attempt cap and single-use guarantee hold under concurrent verify requests.
  const outcome = await verifyAndConsumeOtp(requestId, phoneNumber, code);

  switch (outcome.kind) {
    case 'not_found':
      // Unknown id → treat as expired/consumed (don't leak which ids exist).
      log.warn('request_not_found', { phoneNumber, requestId });
      return errorResponse(410, 'otp_expired', 'This code has expired');
    case 'phone_mismatch':
      log.warn('phone_mismatch', { phoneNumber, requestId, storedPhone: outcome.storedPhone });
      return errorResponse(400, 'otp_invalid', 'Incorrect code');
    case 'consumed':
      log.warn('already_consumed', { phoneNumber, requestId });
      return errorResponse(410, 'otp_expired', 'This code has already been used');
    case 'expired':
      log.warn('expired', { phoneNumber, requestId, expiredAgoMs: outcome.expiredAgoMs });
      return errorResponse(410, 'otp_expired', 'This code has expired');
    case 'too_many':
      log.warn('too_many_attempts', { phoneNumber, requestId, attempts: outcome.attempts });
      return errorResponse(429, 'too_many_attempts', 'Too many attempts; request a new code');
    case 'locked_out':
      log.warn('wrong_code_locked_out', { phoneNumber, requestId, attempts: outcome.attempts });
      return errorResponse(429, 'too_many_attempts', 'Too many attempts; request a new code');
    case 'wrong':
      log.warn('wrong_code', { phoneNumber, requestId, attempts: outcome.attempts });
      return errorResponse(400, 'otp_invalid', 'Incorrect code');
  }

  // outcome.kind === 'ok'
  const data = outcome.data;

  // A code requested for password reset must not sign anyone in here — replaying it
  // as an auth code could even create a phone-only account and break the reset.
  if (data.purpose === 'reset') {
    log.warn('purpose_mismatch', { phoneNumber, requestId, purpose: data.purpose });
    return errorResponse(400, 'otp_invalid', 'Incorrect code');
  }
  log.info('code_ok', { phoneNumber, requestId, purpose: data.purpose });

  try {
    if (data.purpose === 'link') {
      // Re-verify the caller owns the account they're attaching the phone to.
      const idToken = String(body.idToken ?? '');
      if (!idToken) {
        log.warn('link_idtoken_missing', { phoneNumber, requestId });
        return errorResponse(401, 'unauthorized', 'idToken is required for purpose "link"');
      }
      let uid: string;
      try {
        uid = (await adminAuth.verifyIdToken(idToken)).uid;
      } catch (e) {
        log.warn('link_idtoken_invalid', { phoneNumber, requestId, error: (e as Error).message });
        return errorResponse(401, 'unauthorized', 'Invalid idToken');
      }

      // Don't move a phone that already belongs to a different account.
      try {
        const existing = await adminAuth.getUserByPhoneNumber(phoneNumber);
        if (existing.uid !== uid) {
          log.warn('phone_in_use', {
            phoneNumber,
            requestId,
            callerUid: uid,
            ownerUid: existing.uid,
          });
          return errorResponse(409, 'phone_in_use', 'Phone number already in use by another account');
        }
      } catch (e) {
        if (!isUserNotFound(e)) throw e;
      }

      await adminAuth.updateUser(uid, { phoneNumber });
      const user = await adminAuth.getUser(uid);
      const token = await adminAuth.createCustomToken(uid);

      log.info('linked', {
        phoneNumber,
        requestId,
        uid,
        primaryAuthMethod: user.email ? 'email' : 'phone',
      });
      return NextResponse.json({
        customToken: token,
        uid,
        isNewUser: false,
        primaryAuthMethod: user.email ? 'email' : 'phone',
        lang: data.lang ?? 'en',
      });
    }

    // Race: the account can be created between /otp/request and here (same person on
    // another device, or a concurrent "auth" flow). A "signup" code must never sign
    // someone into an account that already existed, so re-check now. The code is
    // already consumed by verifyAndConsumeOtp above — a rejected signup burns it.
    if (data.purpose === 'signup' && (await phoneAccountExists(phoneNumber))) {
      log.warn('account_exists', { phoneNumber, requestId, purpose: data.purpose });
      return errorResponse(
        409,
        'account_exists',
        'An account already exists for this phone number.',
      );
    }

    // purpose "auth"/"signup": sign in by phone, creating the account if needed.
    let user;
    let isNewUser = false;
    try {
      user = await adminAuth.getUserByPhoneNumber(phoneNumber);
      log.info('existing_user', { phoneNumber, requestId, uid: user.uid });
    } catch (e) {
      if (!isUserNotFound(e)) throw e;
      user = await adminAuth.createUser({ phoneNumber });
      isNewUser = true;
      log.info('user_created', { phoneNumber, requestId, uid: user.uid });
    }

    const token = await adminAuth.createCustomToken(user.uid);

    log.info('authenticated', {
      phoneNumber,
      requestId,
      uid: user.uid,
      isNewUser,
      primaryAuthMethod: user.email ? 'email' : 'phone',
    });
    return NextResponse.json({
      customToken: token,
      uid: user.uid,
      isNewUser,
      primaryAuthMethod: user.email ? 'email' : 'phone',
      lang: data.lang ?? 'en',
    });
  } catch (e) {
    log.error('identity_step_failed', {
      phoneNumber,
      requestId,
      purpose: data.purpose,
      firebaseCode: (e as { code?: string })?.code ?? null,
      error: (e as Error).message,
    });
    return errorResponse(500, 'server_error', 'Failed to complete sign-in');
  }
}
