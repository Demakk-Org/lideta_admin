import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Reachable without signing in. `/delete-account` must stay public for Google Play.
const PUBLIC_PATHS = ['/login', '/delete-account'];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.includes(path);
  const token = request.cookies.get('token')?.value || '';

  // If trying to access protected routes without a token
  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // If logged in but trying to access login page
  if (path === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }
}

export const config = {
  // Dashboard pages now live at the root, so match everything except API
  // routes, Next internals and static files (e.g. /bibles/am.json).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
