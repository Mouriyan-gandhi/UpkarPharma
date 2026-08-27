import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

function toE164(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return phone.startsWith('+') ? phone : '+' + d;
}

// Dev-only phone+password login for the mobile app so we can test without
// real OTP delivery. Returns a Supabase access_token the mobile app uses as
// its Authorization bearer for subsequent API calls.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const { phone, password } = await request.json();
    if (!phone || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Sign in against Supabase Auth
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data, error } = await client.auth.signInWithPassword({
      phone: toE164(phone),
      password,
    });
    if (error || !data.session) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Fetch profile via service_role (bypasses RLS)
    const sb = supabaseAdmin();
    const { data: profile } = await sb
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (profile.is_blocked) {
      return NextResponse.json({ error: 'Account blocked' }, { status: 403 });
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
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      // Legacy alias so the mobile app doesn't break during the cut-over:
      session_id: data.session.access_token,
      message: 'Dev login successful',
    });
  } catch (err) {
    console.error('Dev Login Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
