import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import Logger from '@/lib/utils/logger';

export type AdminIdentity = {
  uid: string;
  email?: string;
};

export class NotAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'NotAdminError';
  }
}

/** Throws a 403 unless `users/{uid}` carries role ADMIN. */
export async function assertAdminRole(
  uid: string,
  routeName: string,
): Promise<void> {
  const profile = await adminDb.collection('users').doc(uid).get();
  const role = String(profile.data()?.role ?? '').toUpperCase();
  if (role !== 'ADMIN') {
    Logger.error(routeName, 'Rejected a non-admin caller', { uid });
    throw new NotAdminError('Administrator access required', 403);
  }
}

/**
 * Proves the caller is a signed-in administrator.
 *
 * `middleware.ts` only checks that a `token` cookie is *present*, and it does
 * not run on `/api` at all — so neither the dashboard layout nor an API route
 * that deletes accounts can lean on it. This verifies the Firebase session
 * cookie minted by `/api/session` (signature, expiry, revocation) and then
 * re-checks the caller's own `users/{uid}` document still carries role ADMIN,
 * so demoting a user locks them out on their next request.
 */
export async function requireAdmin(routeName: string): Promise<AdminIdentity> {
  const token = (await cookies()).get('token')?.value;
  if (!token) {
    throw new NotAdminError('Not signed in', 401);
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifySessionCookie(token, true);
    uid = decoded.uid;
    email = decoded.email;
  } catch (error) {
    Logger.error(routeName, 'Rejected an unverifiable session token', {
      error: (error as Error).message,
    });
    throw new NotAdminError('Session expired, sign in again', 401);
  }

  await assertAdminRole(uid, routeName);
  return { uid, email };
}
