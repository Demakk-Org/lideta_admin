import { NextRequest, NextResponse } from 'next/server';

import { adminAuth } from '@/lib/firebase/admin';
import { OTP_REQUEST_SECRET } from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { makeOtpLogger } from '@/lib/otp/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/google/unlink-password — remove the `password` sign-in method from the
 * CALLER'S OWN account.
 *
 * Reached when /api/google/link reported `claimCheckRequired`, the app asked "did you
 * create this account?", and the user answered no. The account's email was never
 * verified, so its password was never proven to belong to anyone; Google has proven
 * the caller owns the inbox. Revoking the password locks out whoever set it while
 * leaving every document intact — nothing is deleted, so nothing is unrecoverable.
 * A genuine owner who wanted that password back does an ordinary password reset
 * through the inbox they demonstrably control.
 *
 * Authorization is the caller's own Firebase ID token, NOT the email in the body:
 * the shared secret only proves the request came from the app, so without this a
 * caller could strip the password from any account they could name.
 */
export async function POST(req: NextRequest) {
  const log = makeOtpLogger('google/unlink-password', crypto.randomUUID());

  const appSecret = req.headers.get('x-otp-app-secret');
  if (!OTP_REQUEST_SECRET || !appSecret || appSecret !== OTP_REQUEST_SECRET) {
    log.warn('unauthorized', { reason: 'bad_app_secret' });
    return errorResponse(401, 'unauthorized', 'Missing or invalid app secret');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_request', 'Malformed request body');
  }

  const idToken = String(body.idToken ?? '').trim();
  if (!idToken) {
    log.warn('id_token_missing');
    return errorResponse(400, 'invalid_request', 'Missing idToken');
  }

  try {
    // checkRevoked: a session disabled since issue must not still revoke credentials.
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const uid = decoded.uid;

    const user = await adminAuth.getUser(uid);

    // Refuse to strip the only way in. After /google/link the caller holds a Google
    // provider, so this should never fire — but an account left password-only would
    // become unreachable, which is exactly the unrecoverable outcome we're avoiding.
    const remaining = user.providerData.filter((p) => p.providerId !== 'password');
    if (remaining.length === 0) {
      log.warn('would_orphan_account', { uid });
      return errorResponse(
        409,
        'invalid_request',
        'Cannot remove the only sign-in method on this account',
      );
    }

    const hadPassword = user.providerData.some((p) => p.providerId === 'password');
    let customToken: string | null = null;

    if (hadPassword) {
      await adminAuth.updateUser(uid, { providersToUnlink: ['password'] });

      // Removing the credential does not end sessions already opened with it, so
      // whoever set that password would stay signed in on their own device until
      // their refresh token expired. Revoking closes that window.
      await adminAuth.revokeRefreshTokens(uid);

      // Revocation is account-wide and would sign the caller out too, so hand back
      // a fresh token for them to re-establish their own session with.
      customToken = await adminAuth.createCustomToken(uid);
    }

    log.info('password_unlinked', { uid, hadPassword });
    return NextResponse.json({ uid, unlinked: hadPassword, customToken });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? null;
    if (
      code === 'auth/id-token-expired' ||
      code === 'auth/id-token-revoked' ||
      code === 'auth/argument-error'
    ) {
      log.warn('id_token_invalid', { firebaseCode: code });
      return errorResponse(401, 'unauthorized', 'Session is no longer valid');
    }
    log.error('unlink_failed', { firebaseCode: code, error: (e as Error).message });
    return errorResponse(500, 'server_error', 'Failed to update sign-in methods');
  }
}
