import { NextRequest, NextResponse } from 'next/server';

import { adminAuth } from '@/lib/firebase/admin';
import { OTP_REQUEST_SECRET, missingCoreConfig } from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { makeOtpLogger } from '@/lib/otp/log';
import { emailOwnerUid } from '@/lib/otp/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Attaches an email to the caller's own account, unverified.
 *
 * Why this isn't done on the client: the app's native route would be
 * `verifyBeforeUpdateEmail`, but that is a security-sensitive operation and
 * Firebase requires a login from the last ~5 minutes. A phone-OTP user adding
 * their email from the profile page effectively never has one, so the call
 * fails with `requires-recent-login` and there is nowhere sensible to send them
 * to re-authenticate. The Admin SDK is not subject to that rule.
 *
 * The address is written with `emailVerified: false`; the app then asks
 * Firebase to mail the standard verification link (`sendEmailVerification`,
 * which is NOT sensitive and needs no recent login).
 *
 * Authorization: the shared app secret AND a valid idToken. The idToken is the
 * only thing that decides WHICH account is written to — the body cannot name a
 * uid — so a caller can only ever modify itself.
 */
export async function POST(req: NextRequest) {
  const log = makeOtpLogger('email/set', crypto.randomUUID());

  if (missingCoreConfig().length) {
    log.error('config_missing', { missing: missingCoreConfig() });
    return errorResponse(500, 'server_error', 'Auth backend is not configured');
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

  const email = String(body.email ?? '').trim().toLowerCase();
  const idToken = String(body.idToken ?? '').trim();

  if (!EMAIL_RE.test(email)) {
    log.warn('invalid_email');
    return errorResponse(400, 'invalid_email', 'A valid email is required');
  }

  if (!idToken) {
    log.warn('missing_id_token');
    return errorResponse(401, 'unauthorized', 'idToken is required');
  }

  let callerUid: string;
  try {
    callerUid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    log.warn('bad_id_token');
    return errorResponse(401, 'unauthorized', 'Invalid idToken');
  }

  // Refuse an address that already belongs to somebody else. Re-adding your
  // own is a no-op, not a collision.
  let ownerUid: string | null;
  try {
    ownerUid = await emailOwnerUid(email);
  } catch (e) {
    // A transient lookup failure must not be treated as "the address is free".
    log.error('lookup_failed', { error: String(e) });
    return errorResponse(500, 'server_error', 'Could not check the address');
  }

  if (ownerUid !== null && ownerUid !== callerUid) {
    log.warn('email_in_use', { callerUid });
    return errorResponse(409, 'email_in_use', 'That email is on another account');
  }

  try {
    await adminAuth.updateUser(callerUid, { email, emailVerified: false });
  } catch (e) {
    // Loses the race against a concurrent claim of the same address.
    if ((e as { code?: string })?.code === 'auth/email-already-exists') {
      log.warn('email_in_use_on_write', { callerUid });
      return errorResponse(409, 'email_in_use', 'That email is on another account');
    }
    log.error('update_failed', { callerUid, error: String(e) });
    return errorResponse(500, 'server_error', 'Could not set the address');
  }

  log.info('email_set', { callerUid });
  return NextResponse.json({ ok: true });
}
