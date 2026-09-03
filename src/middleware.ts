import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ─── CORS ────────────────────────────────────────────────────────────────
// Access-Control-Allow-Origin doesn't support comma-separated lists — it's
// either one origin, "*", or absent. To allow multiple origins we have to
// inspect the incoming Origin header and echo back the specific one if it's
// in our allowlist. That means CORS handling belongs in middleware, not
// next.config.ts's static headers().
//
// Set ALLOWED_WEB_ORIGINS in Vercel to a comma-separated list of every
// browser origin that should be able to call /api/*. In addition, common
// local dev origins are always allowed so mobile-web testing works out
// of the box.
const ALWAYS_ALLOWED = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
]);
const envAllowed = (process.env.ALLOWED_WEB_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const allowlist = new Set([...ALWAYS_ALLOWED, ...envAllowed]);

function applyCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  if (origin && allowlist.has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type, Authorization, x-session-id');
  }
  return response;
}

// Edge middleware. Two responsibilities:
//   1. CORS for /api/* — dynamic, per-request origin echoing.
//   2. Auth gating for /admin, /shop, and login-page bouncing.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // Handle CORS preflight without touching Supabase or DB.
  if (isApi && request.method === 'OPTIONS') {
    return applyCors(request, new NextResponse(null, { status: 204 }));
  }

  // API requests: pass through, tack on CORS headers on the way out.
  if (isApi) {
    return applyCors(request, NextResponse.next({ request }));
  }

  // Everything below is page-level auth gating.
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAdminProtected    = pathname === '/' || pathname.startsWith('/admin');
  const isCustomerProtected = pathname.startsWith('/shop');
  const isAdminLogin        = pathname === '/login';
  const isCustomerLogin     = pathname === '/customer-login' || pathname === '/customer-signup';

  if ((isAdminProtected || isCustomerProtected) && !user) {
    const to = isCustomerProtected ? '/customer-login' : '/login';
    return NextResponse.redirect(new URL(to, request.url));
  }

  if (isAdminLogin && user) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }
  if (isCustomerLogin && user) {
    return NextResponse.redirect(new URL('/shop', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/', '/admin', '/admin/:path*',
    '/login', '/shop', '/shop/:path*',
    '/customer-login', '/customer-signup',
    '/api/:path*',
  ],
};
