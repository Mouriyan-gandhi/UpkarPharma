import { NextResponse } from 'next/server';
import { getMobileUser, getWebUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/verify/resend
//
// Resends the Supabase email-confirmation link to the signed-in customer's
// real email. Uses the anon client's auth.resend() which respects Supabase's
// built-in confirmation email template. Rate-limited so a customer can't
// hammer their own inbox by tapping the button repeatedly.
//
// Behaviour by state:
//   - Already verified → 200 with { alreadyVerified: true }
//   - Auth user email is synthetic (legacy account) → 400 "email on file
//     isn't real; update it via signup or contact support"
//   - Fresh send → 200 with { sent: true }
export async function POST(request: Request) {
  const gate = checkRateLimit(request, 'verify-resend', { max: 3, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute before trying again.' },
      { status: 429 },
    );
  }

  const user = (await getMobileUser(request)) || (await getWebUser());
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: authUser } = await sb.auth.admin.getUserById(user.id);
  if (!authUser?.user) {
    return NextResponse.json({ error: 'Auth account not found' }, { status: 404 });
  }
  if (authUser.user.email_confirmed_at) {
    return NextResponse.json({ alreadyVerified: true });
  }
  const targetEmail = authUser.user.email || '';
  if (!targetEmail || targetEmail.endsWith('@upkem.internal')) {
    return NextResponse.json({
      error: "This account's email is a legacy placeholder. Update it via profile or contact support to re-verify.",
    }, { status: 400 });
  }

  const publicClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await publicClient.auth.resend({
    type: 'signup',
    email: targetEmail,
    options: { emailRedirectTo: 'upkemlabs://verified' },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sent: true, email: targetEmail });
}
