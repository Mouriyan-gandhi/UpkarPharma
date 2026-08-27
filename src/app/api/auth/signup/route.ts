import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';

function toE164(phone: string): string {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return phone.startsWith('+') ? phone : '+' + d;
}

// Signup completes the profile after phone OTP verify.
// The auth.users row already exists (created by verifyOtp). This endpoint
// upserts additional profile fields (store_name, user_type, drug_license, etc.)
// onto public.users. Server-side use of service_role bypasses RLS so the
// initial signup (with is_approved=false) works cleanly.
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const {
      phone,
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

    const sb = supabaseAdmin();
    const phoneE164 = toE164(phone);

    // Find the auth user by phone (created earlier via OTP verify).
    // If they never verified OTP, create the auth user now so signup can proceed.
    let userId: string | null = null;

    // Try to find via listUsers (limit 1000 — fine for early scale).
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = users?.users.find(u => u.phone === phoneE164.replace(/^\+/, ''));
    if (existing) {
      userId = existing.id;
    } else {
      // No auth row yet — create it with a random password (they'll use OTP).
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        phone: phoneE164,
        phone_confirm: true,
        password: crypto.randomBytes(16).toString('hex'),
        user_metadata: { store_name },
      });
      if (createErr || !created.user) {
        return NextResponse.json({ error: createErr?.message || 'Failed to create user' }, { status: 500 });
      }
      userId = created.user.id;
    }

    // Upsert profile (the DB trigger already created a partial row on auth insert).
    const { error: upErr } = await sb.from('users').upsert({
      id: userId,
      phone: phoneE164.replace(/^\+/, ''),
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
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Registration successful. Pending approval.',
    });
  } catch (err) {
    console.error('Signup Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
