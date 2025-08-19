import { auth } from '@/lib/firebase/config';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

export async function loginWithEmail(email: string, password: string): Promise<void> {
  console.log('[authApi] loginWithEmail email', email);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    console.log('[authApi] loginWithEmail success', cred.user.uid);
  } catch (err) {
    console.error('[authApi] loginWithEmail error', err);
    throw new Error('Failed to sign in');
  }
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
