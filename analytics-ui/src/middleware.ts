import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/setup/license',
  '/api/',
  '/_next',
  '/favicon.ico',
  '/images',
  '/login',
  '/register',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // For _next/data requests (client-side navigation), Next.js rewrites the
  // pathname to the page path. Detect these via the x-nextjs-data header and
  // let them through — the client-side LicenseGuard handles license checks.
  if (request.headers.get('x-nextjs-data')) {
    return NextResponse.next();
  }

  // Check license status cookie (only for full page loads)
  const licenseCookie = request.cookies.get('nqrust_license_status');
  if (!licenseCookie || licenseCookie.value !== 'valid') {
    return NextResponse.redirect(new URL('/setup/license', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
