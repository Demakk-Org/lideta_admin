import { adminAuth } from '@/lib/firebase/admin';

/** firebase-admin error code for a phone/uid lookup miss. */
export function isUserNotFound(e: unknown): boolean {
  return (e as { code?: string })?.code === 'auth/user-not-found';
}

/**
 * Whether a Firebase user already owns this phone number. Used by the `signup`
 * purpose, which must fail loudly instead of silently signing the caller into an
 * existing account. Any non-"user-not-found" error is rethrown so a transient
 * Admin SDK failure surfaces as a 500 rather than a false "number is free".
 */
export async function phoneAccountExists(
  phoneNumber: string,
): Promise<boolean> {
  try {
    await adminAuth.getUserByPhoneNumber(phoneNumber);
    return true;
  } catch (e) {
    if (isUserNotFound(e)) return false;
    throw e;
  }
}

export async function phoneOwnerUid(
  phoneNumber: string,
): Promise<string | null> {
  try {
    const user = await adminAuth.getUserByPhoneNumber(phoneNumber);
    return user.uid;
  } catch (e) {
    if (isUserNotFound(e)) return null;
    throw e;
  }
}

export async function emailOwnerUid(email: string): Promise<string | null> {
  try {
    const user = await adminAuth.getUserByEmail(email);
    return user.uid;
  } catch (e) {
    if (isUserNotFound(e)) return null;
    throw e;
  }
}
