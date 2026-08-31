import { NextResponse } from 'next/server';

// Stable, machine-readable error codes. The mobile app switches on these to show
// its own localized message — keep the values stable.
export type OtpErrorCode =
  | 'invalid_phone'
  | 'rate_limited'
  | 'otp_invalid'
  | 'otp_expired'
  | 'too_many_attempts'
  | 'phone_in_use'
  // Distinct from `phone_in_use` (link-time collision with a *different* account):
  // this one means purpose:"signup" hit a number that already has an account.
  | 'account_exists'
  | 'account_not_found'
  // /email/set: the address is already on a different account.
  | 'email_in_use'
  | 'invalid_email'
  | 'no_password_account'
  | 'weak_password'
  | 'sms_send_failed'
  | 'unauthorized'
  // /google/link: the Google ID token failed signature/issuer/expiry/audience
  // verification, or Google itself has not verified the address on it.
  | 'invalid_token'
  // /google/link: refused because the existing Firebase account never verified
  // its email — linking on a bare email match would hand over someone's data.
  | 'email_not_verified'
  | 'account_disabled'
  | 'invalid_request'
  | 'server_error';

/**
 * Build an error response of the shape `{ error: { code, message }, ...extra }`.
 * `extra` is merged at the top level (used to attach `resendAfterSeconds` on 429).
 */
export function errorResponse(
  status: number,
  code: OtpErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message }, ...(extra ?? {}) },
    { status },
  );
}
