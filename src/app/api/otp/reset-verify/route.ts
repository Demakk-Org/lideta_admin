import { NextRequest, NextResponse } from 'next/server';

import { OTP_REQUEST_SECRET, missingCoreConfig } from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { makeOtpLogger } from '@/lib/otp/log';
import { checkOtp } from '@/lib/otp/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Screen 1 of the two-step phone-reset UI: confirm the code is correct WITHOUT
// consuming it, so the same code can still be redeemed by /otp/reset-password on
// screen 2. Wrong guesses here still count against the attempt cap (see checkOtp).
export async function POST(req: NextRequest) {
  const log = makeOtpLogger('otp/reset-verify', crypto.randomUUID());

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

  log.info('incoming', { phoneNumber, requestId, codeLen: code.length });

  if (!phoneNumber || !code || !requestId) {
    log.warn('invalid_request', {
      hasPhone: Boolean(phoneNumber),
      hasCode: Boolean(code),
      hasRequestId: Boolean(requestId),
    });
    return errorResponse(400, 'invalid_request', 'phoneNumber, code and requestId are required');
  }

  // Non-consuming check — same expiry / attempt-cap / latest-wins rules as verify.
  const outcome = await checkOtp(requestId, phoneNumber, code);

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

  // outcome.kind === 'ok' — code is valid and still unspent.
  const data = outcome.data;

  // Only reset codes may pass here; an auth/link code reveals nothing useful.
  if (data.purpose !== 'reset') {
    log.warn('purpose_mismatch', { phoneNumber, requestId, purpose: data.purpose });
    return errorResponse(400, 'otp_invalid', 'Incorrect code');
  }

  log.info('reset_code_valid', { phoneNumber, requestId });
  return NextResponse.json({ valid: true });
}
