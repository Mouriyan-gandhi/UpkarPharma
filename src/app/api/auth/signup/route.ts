import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';
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
      years_in_business,
    } = data;

    if (!phone || !store_name || !user_type) {
      return NextResponse.json(
        { error: 'Phone, Store Name, and User Type are required' },
        { status: 400 }
      );
    }
    // Email is now mandatory (the customer will use it for verification,
    // password resets, and future Google Sign-in linkage). Validate format
    // server-side too — mobile can be tampered with.
    const emailStr = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return NextResponse.json(
        { error: 'A valid email is required' },
        { status: 400 }
      );
    }
    // Password is REQUIRED now — mobile always sends one (confirm is enforced
    // on the client). Without a password the customer can't sign in.
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }
    const finalPassword = password;

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
    // Also block if someone else already registered this email — auth.users.email
    // has a unique constraint, so the create would fail with a confusing error.
    if (users?.users.some(u => u.email?.toLowerCase() === emailStr)) {
      return NextResponse.json(
        { error: 'This email is already registered. Log in instead or use a different email.' },
        { status: 409 }
      );
    }

    // Use the anon client's public signUp() — this is what actually TRIGGERS
    // Supabase's built-in confirmation email. The admin.createUser() call
    // (previously used) creates the auth user but never sends the email even
    // with email_confirm:false.
    //
    // emailRedirectTo drives the "click the link → land here" destination.
    // We include upkemlabs://verified so on mobile the OS opens the APK
    // directly; the web page at /auth/verified is the browser fallback.
    // Supabase picks whichever the calling client passes; we hand off the
    // deep link since the customer signed up on mobile.
    const publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: signup, error: createErr } = await publicClient.auth.signUp({
      email: emailStr,
      password: finalPassword,
      options: {
        emailRedirectTo: 'upkemlabs://verified',
        data: { store_name, phone: phoneDigits },
      },
    });
    if (createErr || !signup.user) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create user' },
        { status: 500 }
      );
    }
    // Attach the phone via service-role since signUp doesn't accept it.
    await sb.auth.admin.updateUserById(signup.user.id, {
      phone: phoneE164,
      phone_confirm: true,
    }).catch(() => { /* non-blocking — phone will be persisted on next login */ });
    const created = { user: signup.user };

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
      email: emailStr,
      zone: zone || null,
      city: city || null,
      years_in_business: typeof years_in_business === 'string' ? years_in_business : null,
      is_approved: false,
      is_rejected: false,
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
