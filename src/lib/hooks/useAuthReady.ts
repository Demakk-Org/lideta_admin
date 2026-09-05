'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';

export type AuthReadyState = {
  /** False until Firebase has restored (or ruled out) a session. */
  ready: boolean;
  uid: string | null;
};

/**
 * Waits for Firebase Auth to restore the session before a screen queries
 * Firestore.
 *
 * `middleware.ts` gates pages on the presence of a `token` cookie, but the
 * Firebase JS SDK restores its own auth state from IndexedDB asynchronously
 * *after* the page mounts. A Firestore read issued in that window carries no
 * credentials, so any rule that inspects `request.auth` rejects it — which is
 * how a correctly configured admin still sees "Missing or insufficient
 * permissions" on a hard refresh.
 */
export function useAuthReady(): AuthReadyState {
  const [state, setState] = useState<AuthReadyState>({
    ready: false,
    uid: null,
  });

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) =>
        setState({ ready: true, uid: user?.uid ?? null }),
      ),
    [],
  );

  return state;
}
