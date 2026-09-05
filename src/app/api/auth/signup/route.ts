import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { pushToAdmins } from '@/lib/push';
import crypto from 'node:crypto';

function toE164(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return phone.startsWith('+') ? phone : '+' + d;
}

// Atomic signup: create the auth.users row AND the public.users profile in
// one call, with the customer-chosen password baked in from the start. This
// closes the account-hijack window that existed when signup + set-password
// were split (an attacker who knew a pending phone number could set the
// victim's password).
//
// If the phone already has an auth user, we REJECT — do not silently reuse
// or overwrite. Recovery for that case is: admin manually resets password
// via Supabase Auth admin, or user proves ownership via OTP (which the
// mobile app already does through /api/auth/otp → /api/auth/verify).
export async function POST(request: Request) {
  try {
    // Signup creates an auth user + sends welcome — cheap to abuse for spam
    // account creation. 5/min is tight; legitimate users don't sign up twice
    // in a minute.
    const gate = checkRateLimit(request, 'auth-signup', { max: 5, windowMs: 60_000 });
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Try again in a minute.' },
        { status: 429 },
      );
    }

    const data = await request.json();
    const {
      phone,
      password,
      store_name,
      user_type,
      drug_license,
      gst_number,
      registration_number,
      address,
      email,
      zone,
      city,
    } = data;

    if (!phone || !store_name || !user_type) {
      return NextResponse.json(
        { error: 'Phone, Store Name, and User Type are required' },
        { status: 400 }
      );
    }
    // If provided, must be strong enough. If omitted (mobile signup path
    // before phone provider is enabled), we generate a random one server-side
    // — the user will reset it via an authenticated password-change flow.
    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || password.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 }
        );
      }
    }
    const finalPassword =
      typeof password === 'string' && password.length >= 6
        ? password
        : crypto.randomBytes(18).toString('base64url');

    const sb = supabaseAdmin();
    const phoneE164 = toE164(phone);
    const phoneDigits = phoneE164.replace(/^\+/, '');

    // Reject if an auth user with this phone already exists — do not overwrite.
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users?.users.some(u => u.phone === phoneDigits)) {
      return NextResponse.json(
        { error: 'This phone number is already registered. Log in instead.' },
        { status: 409 }
      );
    }

    // Synthetic email fallback while Supabase phone provider is disabled —
    // matches src/app/api/auth/route.ts's admin login path.
    const syntheticEmail = `client-${phoneDigits}@upkem.internal`;

    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      phone: phoneE164,
      email: syntheticEmail,
      password: finalPassword,
      phone_confirm: true,
      email_confirm: true,
      user_metadata: { store_name },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    // Insert profile — the DB trigger created a partial row on auth insert,
    // so upsert covers both trigger-present and trigger-absent cases.
    const { error: upErr } = await sb.from('users').upsert({
      id: created.user.id,
      phone: phoneDigits,
      store_name,
      user_type,
      drug_license: drug_license || null,
      gst_number: gst_number || null,
      registration_number: registration_number || null,
      address: address || null,
      email: email || null,
      zone: zone || null,
      city: city || null,
      is_approved: false,
      role: 'client',
    }, { onConflict: 'id' });

    if (upErr) {
      // Roll back the auth user so retry isn't blocked by the 409 above.
      await sb.auth.admin.deleteUser(created.user.id).catch(() => {});
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // Fire admin push + bell entry. Without this, admins had no idea a new
    // partner had signed up until they happened to open the Approvals screen.
    void pushToAdmins({
      type: 'signup_pending',
      title: 'New partner signup',
      body: `${store_name} (+91 ${phoneDigits.slice(-10)}) is awaiting approval.`,
      data: { user_id: created.user.id, phone: phoneDigits, store_name, user_type },
    });

    return NextResponse.json({
      success: true,
      message: 'Registration successful. Pending approval.',
    });
  } catch (err) {
    console.error('Signup Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
