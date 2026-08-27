import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

// Confirm the currently-logged-in admin's password before a sensitive action.
// Uses a throwaway sign-in against Supabase Auth so we never touch bcrypt hashes.
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { password } = await request.json().catch(() => ({}));
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  // Fresh (non-persistent) client so we don't disturb existing session cookies.
  // Uses the same synthetic email fallback as /api/auth (phone provider is
  // pending — see MEMORY.md).
  const phoneDigits = admin.phone.replace(/^\+/, '');
  const syntheticEmail = `admin-${phoneDigits}@upkem.internal`;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error } = await client.auth.signInWithPassword({ email: syntheticEmail, password });
  if (error) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });

  return NextResponse.json({ success: true });
}
