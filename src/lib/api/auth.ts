import { auth } from '@/lib/firebase/config';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

/**
 * Firebase codes that mean "the user typed something wrong", mapped to what the
 * login screen shows. These are expected, so they are logged with
 * `console.warn`: `console.error` pops the Next.js dev error overlay.
 */
const EXPECTED_SIGN_IN_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests':
    'Too many failed attempts. Please wait a moment and try again.',
  'auth/network-request-failed':
    'Network error. Check your connection and try again.',
};

/** Thrown when the credentials are valid but the account isn't an admin. */
export class NotAdminLoginError extends Error {
  constructor() {
    super('This account does not have administrator access');
    this.name = 'NotAdminLoginError';
  }
}

export async function loginWithEmail(email: string, password: string): Promise<void> {
  console.log('[authApi] loginWithEmail email', email);
  let res: Response;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    const code = err instanceof FirebaseError ? err.code : undefined;
    const message = code ? EXPECTED_SIGN_IN_ERRORS[code] : undefined;
    if (message) {
      console.warn('[authApi] loginWithEmail rejected', code);
      throw new Error(message);
    }
    console.error('[authApi] loginWithEmail error', err);
    throw new Error('Failed to sign in. Please try again.');
  }

  if (!res.ok) {
    // The server refused a session (e.g. not an admin); don't leave the
    // Firebase client signed in either.
    await signOut(auth).catch(() => {});
    console.warn('[authApi] loginWithEmail session rejected', res.status);
    if (res.status === 403) throw new NotAdminLoginError();
    throw new Error('Failed to sign in. Please try again.');
  }
  console.log('[authApi] loginWithEmail success', auth.currentUser?.uid);
}

export async function signOutUser(): Promise<void> {
  console.log('[authApi] signOutUser');
  try {
    await signOut(auth);
    await fetch('/api/session', { method: 'DELETE' });
    console.log('[authApi] signOutUser success');
  } catch (err) {
    console.error('[authApi] signOutUser error', err);
    throw new Error('Failed to sign out');
  }
}
