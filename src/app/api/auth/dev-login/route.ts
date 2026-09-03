import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

function toDigits(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.startsWith('91') && d.length === 12) return d;
  return d;
}

// Mobile phone+password login. Historically named 'dev-login' because it
// was the shortcut used in dev while the real Supabase phone provider was
// disabled. Now used by the production mobile app as the primary login
// path — same email-fallback pattern the web /api/auth and /api/customer-auth
// routes use, but returns bearer tokens instead of setting cookies (mobile
// stores + sends them as Authorization: Bearer).
//
// Auth flow:
//   1. Try client-<phone>@upkem.internal + password  (customer accounts)
//   2. Fall back to admin-<phone>@upkem.internal + password  (admin accounts)
//   3. Return access_token + refresh_token + user profile
//
// Rate-limited to protect against brute force.
export async function POST(request: Request) {
  const gate = checkRateLimit(request, 'mobile-login', { max: 10, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a minute.' },
      { status: 429 },
    );
  }

  try {
    const { phone, password } = await request.json();
    if (!phone || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const phoneDigits = toDigits(phone);
    // Try client email first, then admin — matches the web /api/customer-auth
    // ordering so a partner who's actually an admin can still sign in on mobile.
    const emailsToTry = [
      `client-${phoneDigits}@upkem.internal`,
      `admin-${phoneDigits}@upkem.internal`,
    ];

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    let session: { access_token: string; refresh_token: string; user_id: string } | null = null;
    for (const email of emailsToTry) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user_id: data.user!.id,
        };
        break;
      }
    }
    if (!session) {
      return NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
    }

    // Fetch profile via service_role
    const sb = supabaseAdmin();
    const { data: profile } = await sb
      .from('users')
      .select('*')
      .eq('id', session.user_id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (profile.is_blocked) {
      return NextResponse.json({
        error: 'This account has been blocked. Contact UPKEM support.',
      }, { status: 403 });
    }
    if (!profile.is_approved) {
      return NextResponse.json({
        error: 'Account pending admin approval.',
        pending: true,
        user: profile,
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      user: profile,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      // Legacy alias — the mobile client stores this as `sessionId` and
      // uses it verbatim as the Authorization bearer header.
      session_id: session.access_token,
      message: 'Login successful',
    });
  } catch (err) {
    console.error('Mobile login error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
