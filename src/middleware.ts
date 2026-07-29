import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as jose from 'jose';

// Edge middleware cannot import Node-only modules (better-sqlite3). JWT verification
// is sufficient here for redirect-protection; the per-request DB session validation
// happens inside getAdmin() on each API/page server call.
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'upkem-dev-only-secret-change-me'
);

async function isValidAdminToken(token: string): Promise<boolean> {
  try {
    await jose.jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('admin_session')?.value;

  // Protect both root and /admin (and all sub-paths under /admin)
  const isProtected = pathname === '/' || pathname.startsWith('/admin');
  const isLoginPage = pathname === '/login';

  if (isProtected) {
    if (!token || !(await isValidAdminToken(token))) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('admin_session');
      return response;
    }
    return NextResponse.next();
  }

  if (isLoginPage && token && (await isValidAdminToken(token))) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin', '/admin/:path*', '/login'],
};
