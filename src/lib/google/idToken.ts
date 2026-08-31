import { OAuth2Client } from 'google-auth-library';

import { googleLinkAudiences } from '@/lib/otp/config';

/** The subset of Google's ID-token claims this service uses. */
export interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  aud?: string;
}

// No client id/secret needed: verification only fetches Google's public certs.
const oauth = new OAuth2Client();

/**
 * Verify a Google ID token's signature, issuer, expiry AND audience together.
 *
 * Never decode the JWT instead of this — an unverified token is attacker-controlled,
 * and trusting its `email` claim would let anyone post a hand-written JWT and take
 * over the matching account. Throws on any failure; callers map that to 400.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
  const audience = googleLinkAudiences();
  if (!audience.length) {
    throw new Error('No Google client ids configured (GOOGLE_WEB_CLIENT_ID / GOOGLE_IOS_CLIENT_ID)');
  }
  const ticket = await oauth.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('Token carried no payload');
  return payload as GoogleIdTokenPayload;
}

/**
 * The `aud` claim of an UNVERIFIED token, for logging a rejection only.
 *
 * Android sends the *web* client id (google_sign_in uses it as serverClientId), so an
 * audience mismatch on one platform only is the usual cause of `invalid_token`; seeing
 * the rejected `aud` in the log is what makes that diagnosable. Never use this value
 * for any authorization decision.
 */
export function unverifiedAudience(idToken: string): string | null {
  try {
    const claims = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'),
    );
    return typeof claims.aud === 'string' ? claims.aud : null;
  } catch {
    return null;
  }
}
