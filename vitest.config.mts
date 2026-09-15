import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    // config.ts snapshots these at import time, so they must exist before any test
    // file pulls in a route. Values are dummies — Firebase and GeezSMS are mocked.
    env: {
      NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://test.firebaseio.com',
      // firebase/config.ts calls getAuth() at import time, which rejects a blank key.
      NEXT_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
      OTP_HMAC_SECRET: 'test-hmac-secret',
      OTP_REQUEST_SECRET: 'test-app-secret',
      GEEZ_SMS_TOKEN: 'test-geez-token',
      GOOGLE_WEB_CLIENT_ID: 'test-web-client-id',
      GOOGLE_IOS_CLIENT_ID: 'test-ios-client-id',
    },
  },
});
