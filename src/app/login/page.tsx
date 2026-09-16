'use client';

import { Suspense } from 'react';
import LoginPage from './login-page';

export default function Page() {
  // `useSearchParams` in LoginPage needs a Suspense boundary.
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
