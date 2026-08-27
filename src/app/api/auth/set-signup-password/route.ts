import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

function toE164Digits(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return d;
  if (d.length === 10) return '91' + d;
  return d;
}

// Set password for a freshly-signed-up customer whose auth user was created
// with a random password by /api/auth/signup. Also creates a synthetic email
// so they can log in via email fallback (until Supabase phone provider is on).
//
// This is safe to expose because it only works if the customer's public.users
// row exists AND is NOT already approved (i.e. brand new signup pending admin).
export async function POST(request: Request) {
  const { phone, password } = await request.json().catch(() => ({}));
  if (!phone || !password) {
    return NextResponse.json({ error: 'phone + password required' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const digits = toE164Digits(phone);
  const sb = supabaseAdmin();

  // Look up the pending customer
  const { data: profile } = await sb
    .from('users')
    .select('id, phone, is_approved')
    .eq('phone', digits)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'User not found — did signup succeed?' }, { status: 404 });
  if (profile.is_approved) {
    // Already approved: refuse to change password without proper auth
    return NextResponse.json({ error: 'Account already approved. Use the reset-password flow.' }, { status: 403 });
  }

  const email = `client-${digits}@upkem.internal`;
  const { error } = await sb.auth.admin.updateUserById(profile.id, {
    email,
    password,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
