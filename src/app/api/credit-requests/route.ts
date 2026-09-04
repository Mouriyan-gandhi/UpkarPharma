import { NextResponse } from 'next/server';
import { getAnyAdmin, getMobileUser, getWebUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET  /api/credit-requests
//   - admin: returns all requests (newest first)
//   - customer: returns their own requests
// POST /api/credit-requests { amount, note? }
//   - customer only. Rejects if a Pending request already exists.

export async function GET(request: Request) {
  const admin = await getAnyAdmin(request);
  const bearerUser = admin ? null : await getMobileUser(request);
  const isAdmin = !!admin;
  const user = admin || bearerUser || (await getWebUser());
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  let q = sb.from('credit_requests')
    .select('id, user_id, amount, note, status, admin_note, requested_at, reviewed_at, reviewed_by')
    .order('requested_at', { ascending: false });
  if (!isAdmin) q = q.eq('user_id', user.id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Admin gets store names alongside the requests so they don't have to
  // cross-reference by user_id.
  if (isAdmin && data && data.length > 0) {
    const ids = [...new Set(data.map(r => r.user_id))];
    const { data: users } = await sb.from('users').select('id, store_name, phone').in('id', ids);
    const byId = new Map((users || []).map(u => [u.id, u]));
    for (const r of data as any[]) {
      const u = byId.get(r.user_id);
      r.store_name = u?.store_name || null;
      r.phone = u?.phone || null;
    }
  }

  return NextResponse.json({ requests: data || [] });
}

export async function POST(request: Request) {
  const admin = await getAnyAdmin(request);
  const bearerUser = admin ? null : await getMobileUser(request);
  // Only regular customers can create — admins can raise their own limit directly.
  const customer = admin ? null : bearerUser || (await getWebUser());
  if (!customer) return NextResponse.json({ error: 'Only customers can request credit' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 });
  }
  if (amount > 100_000_000) {
    return NextResponse.json({ error: 'amount too large' }, { status: 400 });
  }
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null;

  const sb = supabaseAdmin();
  const { data, error } = await sb.from('credit_requests').insert({
    user_id: customer.id,
    amount,
    note,
  }).select('id, amount, status, requested_at').single();

  if (error) {
    // UNIQUE partial index → "duplicate key value violates" if pending exists.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'You already have a pending credit request. Wait for admin to review it.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ request: data });
}
