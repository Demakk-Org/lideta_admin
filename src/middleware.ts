import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicPath = path === '/' || path === '/login';
  const token = request.cookies.get('token')?.value || '';

  // If trying to access protected routes without a token
  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  // If logged in but trying to access login page
  if (isPublicPath && token) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/login',
  ],
};
