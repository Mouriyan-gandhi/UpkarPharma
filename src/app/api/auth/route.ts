import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Normalize an Indian phone: 10-digit → +91XXXXXXXXXX, keep + if already present.
function toE164(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits;
  if (digits.length === 10) return '+91' + digits;
  return phone.startsWith('+') ? phone : '+' + digits;
}

// Admin login. Uses Supabase Auth phone+password, then verifies the user's
// profile has role='admin'.
export async function POST(request: Request) {
  try {
    const { phone, password } = await request.json();
    if (!phone || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const phoneE164 = toE164(phone);
    const phoneDigits = phoneE164.replace(/^\+/, '');

    // Phone provider not yet enabled — sign in via the synthetic email
    // (`admin-<phone>@upkem.internal`) backfilled by scripts/backfill-admin-emails.mjs.
    // Once the user enables Supabase phone provider, switch this to
    // signInWithPassword({ phone: phoneE164, password }).
    const supabase = await supabaseServer();
    const syntheticEmail = `admin-${phoneDigits}@upkem.internal`;
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });

    if (authErr || !authData.user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Fetch profile to verify admin role (use service_role, bypasses RLS).
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from('users')
      .select('role, is_approved, is_blocked, store_name')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (profile.is_blocked) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'This account has been blocked. Contact UPKEM support.' }, { status: 403 });
    }
    if (!profile.is_approved) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'Account pending approval' }, { status: 403 });
    }
    if (profile.role !== 'admin') {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'Access denied. Admins only.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      store_name: profile.store_name,
      role: profile.role,
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Logout — clears the Supabase session cookies.
export async function DELETE() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
