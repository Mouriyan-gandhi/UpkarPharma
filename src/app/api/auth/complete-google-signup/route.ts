import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { pushToAdmins } from '@/lib/push';

// POST /api/auth/complete-google-signup
//
// Called by the mobile app right after a successful Google OAuth flow WHEN
// the customer signed up via the Signup screen (form-first). Google gave us
// a verified email + name, the form gave us phone / business type / years
// in business / GST / address / etc. This endpoint merges the two and
// creates the public.users profile.
//
// Auth: bearer access_token from the Supabase session Google just handed
// back. The token identifies WHICH auth user the profile belongs to; we
// don't trust the client to say "I'm user X".
//
// Body: the form fields the customer filled before tapping "Sign up with
// Google". Everything except phone is optional — most customers can be
// approved with just phone + email + business type.
//
// Idempotent: if a public.users row already exists for this auth user,
// updates the whitelisted fields instead of creating a duplicate.
export async function POST(request: Request) {
  const gate = checkRateLimit(request, 'google-signup-complete', { max: 5, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });

  const sb = supabaseAdmin();

  // Verify the token → resolve the auth user. Never trust a client-supplied id.
  const { data: authRes, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !authRes.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const authUser = authRes.user;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  const cleanPhone = String(body.phone || '').replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return NextResponse.json({ error: 'A 10-digit phone number is required.' }, { status: 400 });
  }
  const phoneDigits = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;

  // Reject if another user already owns this phone (auth or profile side).
  const { data: usersList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const phoneOwnedBySomeoneElse = usersList?.users.some(
    (u) => u.phone === phoneDigits && u.id !== authUser.id,
  );
  if (phoneOwnedBySomeoneElse) {
    return NextResponse.json({
      error: 'This phone number is already registered to a different account.',
    }, { status: 409 });
  }
  const { data: profilePhoneOwner } = await sb.from('users')
    .select('id').eq('phone', phoneDigits).maybeSingle();
  if (profilePhoneOwner && profilePhoneOwner.id !== authUser.id) {
    return NextResponse.json({
      error: 'This phone number is already registered to a different account.',
    }, { status: 409 });
  }

  // Attach the phone to the auth user (Supabase treats phone as an auth-level
  // identifier, so this makes phone-based sign-in work later).
  await sb.auth.admin.updateUserById(authUser.id, {
    phone: '+' + phoneDigits,
    phone_confirm: true,
  }).catch(() => { /* non-blocking — phone will still be in public.users */ });

  // Whitelist the fields we accept from the form. Anything not in this list
  // is silently dropped; can't be tricked into flipping is_admin etc.
  const patch: any = {
    id: authUser.id,
    phone: phoneDigits,
    email: (authUser.email || body.email || '').toLowerCase(),
    email_verified: true,           // Google verified this — trust it
    is_approved: false,
    is_rejected: false,
    role: 'client',
  };
  for (const k of ['store_name','user_type','years_in_business','drug_license','gst_number','registration_number','address','zone','city','google_maps_link']) {
    if (body[k] !== undefined) patch[k] = body[k] || null;
  }
  // If the customer used Google's display name we haven't set store_name yet,
  // fall back to the Google metadata full_name so admin at least sees SOMETHING.
  if (!patch.store_name) {
    patch.store_name = (authUser.user_metadata?.full_name as string) || (authUser.user_metadata?.name as string) || 'Google customer';
  }

  const { error: upErr } = await sb.from('users').upsert(patch, { onConflict: 'id' });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Fetch back so the client can hydrate the store with the full row.
  const { data: profile } = await sb.from('users').select('*').eq('id', authUser.id).maybeSingle();

  // Notify admins so they know a signup landed. Only fire on TRULY new profiles
  // (first insert) — return-visit updates shouldn't spam Dhruv.
  const isNew = !(profilePhoneOwner && profilePhoneOwner.id === authUser.id);
  if (isNew) {
    void pushToAdmins({
      type: 'signup_pending',
      title: 'New partner signup (via Google)',
      body: `${patch.store_name} (+91 ${cleanPhone.slice(-10)}) is awaiting approval.`,
      data: { user_id: authUser.id, phone: phoneDigits, store_name: patch.store_name },
    });
  }

  return NextResponse.json({
    success: true,
    user: profile,
    isNew,
  });
}

// GET — quick check "does this Google-authed user already have a profile?"
// Called from the Login screen after Google Sign-in so the client can decide
// whether to route to Home or bounce to the Signup screen with form pre-fill.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: authRes } = await client.auth.getUser(token);
  if (!authRes.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: profile } = await sb.from('users').select('*').eq('id', authRes.user.id).maybeSingle();
  return NextResponse.json({
    hasProfile: !!profile,
    profile,
    authEmail: authRes.user.email,
    authName: (authRes.user.user_metadata?.full_name as string) || (authRes.user.user_metadata?.name as string) || null,
  });
}
