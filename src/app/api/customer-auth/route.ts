import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

function toE164(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return phone.startsWith('+') ? phone : '+' + d;
}

// Customer login. Same email-fallback pattern as admin — synthetic email is
// `client-<phoneE164>@upkem.internal`. Allows role='client' AND role='admin'
// (admins can preview the customer web app).
export async function POST(request: Request) {
  try {
    const { phone, password } = await request.json();
    if (!phone || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const phoneE164 = toE164(phone);
    const phoneDigits = phoneE164.replace(/^\+/, '');
    // Try client email first, then admin email (for admins previewing shop).
    const attempts = [
      `client-${phoneDigits}@upkem.internal`,
      `admin-${phoneDigits}@upkem.internal`,
    ];

    const supabase = await supabaseServer();
    let authUser: any = null;
    for (const email of attempts) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.user) { authUser = data.user; break; }
    }
    if (!authUser) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Fetch profile via service_role (bypasses RLS)
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from('users')
      .select('id, phone, store_name, role, is_approved, is_blocked')
      .eq('id', authUser.id)
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
      return NextResponse.json({ error: 'Account pending admin approval', pending: true }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      store_name: profile.store_name,
      role: profile.role,
    });
  } catch (err) {
    console.error('Customer login error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Logout — clears the Supabase session cookies.
export async function DELETE() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
