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
  return handleMiddleware(request);
}

async function handleMiddleware(request: NextRequest) {
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

  // Licensing is installation-scoped, so protected page loads confirm with the
  // server instead of trusting a browser-scoped cookie.
  try {
    const checkUrl = new URL('/api/license-check', request.url);
    const res = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });

    if (res.ok) {
      const body = await res.json();
      if (body?.licensed) {
        return NextResponse.next();
      }
    }
  } catch {
    // Fall through to redirect when license state cannot be confirmed.
  }

  return NextResponse.redirect(new URL('/setup/license', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
