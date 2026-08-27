import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Edge middleware: verify Supabase session for admin-only routes.
// Uses the anon key + cookies — no service_role, no DB access here.
// Admin role check happens in the API layer via getAdmin() with the user's session.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

  // Refreshes session if needed and returns the current user (or null).
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
  matcher: ['/', '/admin', '/admin/:path*', '/login', '/shop', '/shop/:path*', '/customer-login', '/customer-signup'],
};
