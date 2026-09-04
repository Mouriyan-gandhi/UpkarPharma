import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/auth/refresh
//
// Mobile clients call this when a bearer access-token has expired (Supabase
// access tokens default to 1h). Trades the stored refresh_token for a fresh
// { access_token, refresh_token } pair. Without this, the mobile app hits
// 401 → falls into offline cache → shows "OFFLINE MODE" banner until the
// user manually re-logs in.
//
// Body: { refresh_token: string }
// Response: { access_token, refresh_token, session_id }
export async function POST(request: Request) {
  const gate = checkRateLimit(request, 'mobile-refresh', { max: 30, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json({ error: 'Too many refreshes. Wait a minute.' }, { status: 429 });
  }

  try {
    const { refresh_token } = await request.json();
    if (!refresh_token || typeof refresh_token !== 'string') {
      return NextResponse.json({ error: 'refresh_token required' }, { status: 400 });
    }

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await client.auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return NextResponse.json({ error: 'Refresh failed — sign in again' }, { status: 401 });
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      // Same alias the mobile client uses in login responses.
      session_id: data.session.access_token,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
