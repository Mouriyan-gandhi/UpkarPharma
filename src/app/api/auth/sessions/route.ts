import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/auth/sessions — list active Supabase Auth sessions for admin users.
// Uses the admin API to enumerate. Only admins can call this.
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sb = supabaseAdmin();
  // List admin users only (small set — safe to fetch all).
  const { data: adminProfiles } = await sb
    .from('users')
    .select('id, phone, store_name')
    .eq('role', 'admin');

  const sessions: any[] = [];
  for (const p of adminProfiles || []) {
    // Supabase doesn't expose per-user session enumeration via the JS client —
    // we surface the user + last sign-in time as a proxy for "active" admins.
    const { data: userRes } = await sb.auth.admin.getUserById(p.id);
    if (userRes?.user) {
      sessions.push({
        id: userRes.user.id,
        phone: p.phone,
        store_name: p.store_name,
        last_sign_in_at: userRes.user.last_sign_in_at,
        created_at: userRes.user.created_at,
      });
    }
  }
  return NextResponse.json({ sessions });
}

// DELETE — sign a specific user out of all their sessions (revoke).
export async function DELETE(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.signOut(id, 'global');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
