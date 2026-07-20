import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as jose from 'jose';

// Edge middleware cannot import the Node-only auth lib (better-sqlite3), so the
// secret is read here directly. The dev fallback MUST stay identical to the one
// in src/lib/auth.ts or admin_session cookies won't verify when JWT_SECRET is unset.
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'upkem-dev-only-secret-change-me');

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value;

  if (request.nextUrl.pathname === '/') {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      await jose.jwtVerify(token, JWT_SECRET);
      return NextResponse.next();
    } catch (err) {
      // Invalid token
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('admin_session');
      return response;
    }
  }

  if (request.nextUrl.pathname === '/login') {
    if (token) {
      try {
        await jose.jwtVerify(token, JWT_SECRET);
        return NextResponse.redirect(new URL('/', request.url));
      } catch (err) {
        // Just let them log in again
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login'],
};
