import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

function toE164(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return phone.startsWith('+') ? phone : '+' + d;
}

// Mobile app: verify the phone OTP the user typed.
// On success, Supabase creates/logs-in the auth.users row; our trigger creates
// the matching public.users row. We return the session tokens to the mobile app.
export async function POST(request: Request) {
  try {
    // OTP verify is a brute-force target for the 6-digit code. 10/min is
    // generous enough for humans mistyping, tight enough that guessing
    // 100k codes takes ~7 hours per IP instead of seconds.
    const gate = checkRateLimit(request, 'auth-verify', { max: 10, windowMs: 60_000 });
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Try again in a minute.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { phone, otp, device_info = 'MobileApp' } = body;

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 });
    }

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const phoneE164 = toE164(phone);
    const { data, error } = await client.auth.verifyOtp({
      phone: phoneE164,
      token: otp,
      type: 'sms',
    });

    if (error || !data.session) {
      return NextResponse.json({ error: error?.message || 'Invalid OTP' }, { status: 401 });
    }

    // Fetch full profile (service_role bypasses RLS)
    const sb = supabaseAdmin();
    const { data: profile } = await sb
      .from('users')
      .select('*')
      .eq('id', data.user!.id)
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
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      // Legacy alias for the current mobile client:
      session_id: data.session.access_token,
      message: 'Login successful',
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
