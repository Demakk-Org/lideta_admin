import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { NotAdminError, assertAdminRole } from '@/lib/server/requireAdmin';
import Logger from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE_NAME = '[sessionApi] POST';
const SESSION_DAYS = 7;
/** Only mint a session from a fresh sign-in, not a replayed old ID token. */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

function clearTokenCookie(res: NextResponse) {
  res.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

/**
 * Exchanges a Firebase ID token for a session cookie — but only for users whose
 * `users/{uid}` document has role ADMIN. Everyone else gets a 403 and no cookie,
 * so they never get past `middleware.ts`.
 */
export async function POST(req: NextRequest) {
  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
      throw new NotAdminError('Recent sign-in required', 401);
    }
    await assertAdminRole(decoded.uid, ROUTE_NAME);

    const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(token, {
      expiresIn,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set('token', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiresIn / 1000,
    });
    return res;
  } catch (error) {
    if (error instanceof NotAdminError) {
      return clearTokenCookie(
        NextResponse.json({ error: error.message }, { status: error.status }),
      );
    }
    Logger.error(ROUTE_NAME, 'Failed to create a session', {
      error: (error as Error).message,
    });
    return clearTokenCookie(
      NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
    );
  }
}

export async function DELETE() {
  return clearTokenCookie(NextResponse.json({ ok: true }));
}

/**
 * Clears the cookie and sends the browser to the login page. The dashboard
 * layout redirects here when a cookie fails the admin check; clearing it first
 * stops `middleware.ts` bouncing `/login` straight back to the dashboard.
 */
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get('reason');
  const loginUrl = new URL('/login', req.nextUrl);
  if (reason === 'forbidden' || reason === 'expired') {
    loginUrl.searchParams.set('reason', reason);
  }
  return clearTokenCookie(NextResponse.redirect(loginUrl));
}
