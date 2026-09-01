import { NextRequest, NextResponse } from 'next/server';

import { adminAuth } from '@/lib/firebase/admin';
import { unverifiedAudience, verifyGoogleIdToken } from '@/lib/google/idToken';
import {
  GOOGLE_LINK_CONFIG,
  OTP_REQUEST_SECRET,
  googleLinkAudiences,
} from '@/lib/otp/config';
import { errorResponse } from '@/lib/otp/errors';
import { makeOtpLogger } from '@/lib/otp/log';
import { checkAndRecordIpHit } from '@/lib/otp/store';
import { isUserNotFound } from '@/lib/otp/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/google/link — attach the `google.com` provider to the EXISTING Firebase
 * account that owns the same (Google-verified) email, and mint a custom token for it.
 *
 * Why a server endpoint at all: `linkWithCredential` is a method on a signed-in
 * `User`, so a client holding only a Google credential cannot complete the link
 * without first asking for the account password. The Admin SDK has no such
 * restriction. See docs/BACKEND_GOOGLE_LINK_SPEC.md.
 *
 * The app treats ANY non-200 as "server linking unavailable" and falls back to its
 * password prompt, so every refusal below costs one dialog — it never blocks sign-in.
 */
export async function POST(req: NextRequest) {
  const log = makeOtpLogger('google/link', crypto.randomUUID());
  log.info('request_start', {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  // Step 1 — authenticate the caller before doing any work.
  const appSecret = req.headers.get('x-otp-app-secret');
  if (!OTP_REQUEST_SECRET || !appSecret || appSecret !== OTP_REQUEST_SECRET) {
    log.warn('unauthorized', {
      reason: !OTP_REQUEST_SECRET ? 'server_unconfigured' : appSecret ? 'wrong_secret' : 'missing_secret',
    });
    return errorResponse(401, 'unauthorized', 'Missing or invalid app secret');
  }
  log.info('step1_authenticated');

  if (!googleLinkAudiences().length) {
    log.error('config_missing', { missing: ['GOOGLE_WEB_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID'] });
    return errorResponse(500, 'server_error', 'Google linking is not configured');
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  log.info('config_ok', {
    audienceCount: googleLinkAudiences().length,
    requireEmailVerified: GOOGLE_LINK_CONFIG.requireEmailVerified,
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    log.warn('invalid_json');
    return errorResponse(400, 'invalid_token', 'The Google token could not be verified');
  }

  const googleIdToken = String(body.googleIdToken ?? '').trim();
  log.info('body_parsed', {
    keys: Object.keys(body),
    tokenLength: googleIdToken.length,
  });
  if (!googleIdToken) {
    log.warn('token_missing');
    return errorResponse(400, 'invalid_token', 'The Google token could not be verified');
  }

  try {
    // Throttle per IP: this turns a user-supplied token into a session for an
    // existing account, so it gets the same treatment as /otp/verify.
    const rate = await checkAndRecordIpHit(
      'google_link',
      ip,
      GOOGLE_LINK_CONFIG.ratePerWindow,
      GOOGLE_LINK_CONFIG.rateWindowSeconds * 1000,
    );
    log.info('rate_check_start', {
      ip,
      cap: GOOGLE_LINK_CONFIG.ratePerWindow,
      windowSeconds: GOOGLE_LINK_CONFIG.rateWindowSeconds,
    });
    if (!rate.allowed) {
      log.warn('rate_limited', { ip, retryAfterSeconds: rate.resendAfterSeconds });
      return errorResponse(429, 'rate_limited', 'Too many attempts; try again later', {
        retryAfterSeconds: rate.resendAfterSeconds,
      });
    }

    log.info('rate_check_ok', { ip });

    // Step 2 — verify signature, issuer, expiry and audience together.
    let payload;
    try {
      payload = await verifyGoogleIdToken(googleIdToken, (step, data) =>
        log.info(`step2_${step}`, data),
      );
    } catch (e) {
      // The `aud` of the rejected token is the one diagnostic worth having here
      // (§6: Android carries the *web* client id). The token itself is never logged.
      log.warn('token_invalid', {
        error: (e as Error).message,
        rejectedAud: unverifiedAudience(googleIdToken),
      });
      return errorResponse(400, 'invalid_token', 'The Google token could not be verified');
    }

    // Step 3 — Google must vouch for the address itself.
    if (!payload.email || payload.email_verified !== true) {
      log.warn('google_email_unverified', { sub: payload.sub, hasEmail: Boolean(payload.email) });
      return errorResponse(400, 'invalid_token', 'The Google token could not be verified');
    }
    const email = payload.email.toLowerCase();
    log.info('step3_google_email_verified', {
      sub: payload.sub,
      emailDomain: email.split('@')[1] ?? null,
      hasName: Boolean(payload.name),
      hasPicture: Boolean(payload.picture),
    });

    // Step 4 — find the account to link to. A miss is the ordinary "nothing to
    // link" case: the app will just create a fresh Google account itself.
    let user;
    log.info('step4_lookup_start', { emailDomain: email.split('@')[1] ?? null });
    try {
      user = await adminAuth.getUserByEmail(email);
    } catch (e) {
      if (!isUserNotFound(e)) throw e;
      log.info('account_not_found', { sub: payload.sub });
      return errorResponse(404, 'account_not_found', 'No account exists for this email');
    }

    log.info('step4_account_found', {
      uid: user.uid,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      providers: user.providerData.map((p) => p.providerId),
      hasPhone: Boolean(user.phoneNumber),
    });

    // Step 5 — policy gates.
    if (user.disabled) {
      log.warn('account_disabled', { uid: user.uid });
      return errorResponse(409, 'account_disabled', 'This account has been disabled');
    }
    // Firebase never verifies email at password signup, so an unverified account may
    // have been registered by someone who never owned the inbox. Linking on the email
    // alone would hand the Google user that person's data (spec §2).
    if (GOOGLE_LINK_CONFIG.requireEmailVerified && !user.emailVerified) {
      log.warn('email_not_verified', { uid: user.uid });
      return errorResponse(
        409,
        'email_not_verified',
        'The existing account has not verified its email',
      );
    }

    log.info('step5_policy_ok', { uid: user.uid });

    // Step 6 — attach the provider. Re-linking throws, so skip when already there;
    // `sub` is Google's stable subject id and is what Firebase keys the provider on.
    const already = user.providerData.some((p) => p.providerId === 'google.com');
    log.info('step6_link_start', { uid: user.uid, alreadyLinked: already, sub: payload.sub });
    if (!already) {
      await adminAuth.updateUser(user.uid, {
        providerToLink: {
          providerId: 'google.com',
          uid: payload.sub,
          email,
          displayName: payload.name,
          photoURL: payload.picture,
        },
      });
    }

    log.info('step6_link_done', { uid: user.uid, linked: !already });

    // Step 7 — mint the session; the app exchanges it via signInWithCustomToken.
    log.info('step7_mint_start', { uid: user.uid });
    const customToken = await adminAuth.createCustomToken(user.uid);
    log.info('linked', { uid: user.uid, sub: payload.sub, linked: !already });
    return NextResponse.json({ customToken, uid: user.uid, linked: !already });
  } catch (e) {
    // Includes the "this Google sub is already on a different uid" case, where
    // updateUser throws — two Firebase accounts for one Google identity, which needs
    // manual reconciliation rather than anything this endpoint can do (spec §7).
    log.error('link_failed', {
      firebaseCode: (e as { code?: string })?.code ?? null,
      error: (e as Error).message,
    });
    return errorResponse(500, 'server_error', 'Failed to link the Google account');
  }
}
