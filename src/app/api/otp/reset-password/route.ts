import { NextRequest, NextResponse } from 'next/server';

import { adminAuth } from '@/lib/firebase/admin';
import { OTP_CONFIG, OTP_REQUEST_SECRET, missingCoreConfig } from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { makeOtpLogger } from '@/lib/otp/log';
import { verifyAndConsumeOtp } from '@/lib/otp/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// firebase-admin error code for a phone/uid lookup miss.
function isUserNotFound(e: unknown): boolean {
  return (e as { code?: string })?.code === 'auth/user-not-found';
}

export async function POST(req: NextRequest) {
  const log = makeOtpLogger('otp/reset-password', crypto.randomUUID());

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
  // Not trimmed — leading/trailing whitespace is part of the password. NEVER logged.
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  log.info('incoming', {
    phoneNumber,
    requestId,
    codeLen: code.length,
    passwordLen: newPassword.length,
  });

  if (!phoneNumber || !code || !requestId || !newPassword) {
    log.warn('invalid_request', {
      hasPhone: Boolean(phoneNumber),
      hasCode: Boolean(code),
      hasRequestId: Boolean(requestId),
      hasPassword: Boolean(newPassword),
    });
    return errorResponse(
      400,
      'invalid_request',
      'phoneNumber, code, requestId and newPassword are required',
    );
  }

  // Password policy is checked before the code is consumed: a weak password should
  // not burn a valid single-use code. Nothing about the code leaks from this branch.
  if (newPassword.length < OTP_CONFIG.passwordMinLength) {
    log.warn('weak_password', { phoneNumber, requestId, passwordLen: newPassword.length });
    return errorResponse(
      400,
      'weak_password',
      `Password must be at least ${OTP_CONFIG.passwordMinLength} characters`,
    );
  }

  // Atomic: same rules as /otp/verify — 5-min expiry, single-use, attempt cap,
  // latest-request-wins.
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

  // A code requested for auth/link must not reset a password.
  if (data.purpose !== 'reset') {
    log.warn('purpose_mismatch', { phoneNumber, requestId, purpose: data.purpose });
    return errorResponse(400, 'otp_invalid', 'Incorrect code');
  }
  log.info('code_ok', { phoneNumber, requestId });

  try {
    let user;
    try {
      user = await adminAuth.getUserByPhoneNumber(phoneNumber);
    } catch (e) {
      if (!isUserNotFound(e)) throw e;
      log.warn('account_not_found', { phoneNumber, requestId });
      return errorResponse(404, 'account_not_found', 'No account found for this phone number');
    }

    // A Firebase password requires an email login — nothing to reset on a
    // phone-only account.
    const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
    if (!user.email || !hasPasswordProvider) {
      log.warn('no_password_account', {
        phoneNumber,
        requestId,
        uid: user.uid,
        hasEmail: Boolean(user.email),
        providers: user.providerData.map((p) => p.providerId),
      });
      return errorResponse(
        409,
        'no_password_account',
        'This account has no password to reset',
      );
    }

    await adminAuth.updateUser(user.uid, { password: newPassword });
    const token = await adminAuth.createCustomToken(user.uid);

    log.info('password_reset', { phoneNumber, requestId, uid: user.uid });
    return NextResponse.json({ customToken: token, uid: user.uid });
  } catch (e) {
    const firebaseCode = (e as { code?: string })?.code ?? null;
    // Backstop in case Firebase's own policy is stricter than ours.
    if (firebaseCode === 'auth/invalid-password') {
      log.warn('weak_password_firebase', { phoneNumber, requestId });
      return errorResponse(400, 'weak_password', 'Password does not meet the policy');
    }
    log.error('reset_step_failed', {
      phoneNumber,
      requestId,
      firebaseCode,
      error: (e as Error).message,
    });
    return errorResponse(500, 'server_error', 'Failed to reset password');
  }
}
