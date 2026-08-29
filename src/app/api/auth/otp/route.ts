import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

function toE164(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return phone.startsWith('+') ? phone : '+' + d;
}

// Send OTP via Supabase Auth (uses the SMS provider configured in Supabase
// dashboard — MSG91 / Twilio / test-mode).
export async function POST(request: Request) {
  try {
    // OTP endpoints tend to be the most expensive to abuse (real SMS spend).
    // Tighter budget than login: 5 requests per IP per minute.
    const gate = checkRateLimit(request, 'auth-otp', { max: 5, windowMs: 60_000 });
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Too many OTP requests. Try again in a minute.' },
        { status: 429 },
      );
    }

    const { phone } = await request.json();
    if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    // signInWithOtp sends OTP; the auto-create trigger in Supabase creates
    // auth.users on the *verify* step, not here.
    const { error } = await client.auth.signInWithOtp({
      phone: toE164(phone),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('OTP send error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
