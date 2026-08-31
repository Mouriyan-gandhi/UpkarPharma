import { NextResponse } from 'next/server';
import { getAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/notifications
// Customer: their own notifications (user_id = them)
// Admin: their own + all admin-broadcast notifications (for_admin=true)
export async function GET(request: Request) {
  const admin = await getAdmin();
  const mobile = admin ? null : await getMobileUser(request);
  if (!admin && !mobile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const userId = admin?.id || mobile!.id;

  const q = admin
    ? sb.from('notifications').select('*').or(`user_id.eq.${userId},for_admin.eq.true`).order('created_at', { ascending: false }).limit(100)
    : sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unread = (data || []).filter((n) => !n.read).length;
  return NextResponse.json({ notifications: data || [], unread });
}

// POST /api/notifications
// Admin-only: broadcast a notification.
//   { target: 'all',  title, body, type? }             → one row per customer
//   { target: 'user', user_id, title, body, type? }    → one row for that user
// Also fires an Expo push (best-effort) to each recipient with a token.
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { target, user_id, title, body: msg, type = 'admin_broadcast' } = body || {};
  if (!title || !msg) {
    return NextResponse.json({ error: 'title + body required' }, { status: 400 });
  }
  if (target !== 'all' && target !== 'user') {
    return NextResponse.json({ error: "target must be 'all' or 'user'" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Resolve recipient list.
  let recipients: Array<{ id: string; expo_push_token: string | null }> = [];
  if (target === 'user') {
    if (!user_id) return NextResponse.json({ error: 'user_id required for target=user' }, { status: 400 });
    const { data } = await sb.from('users').select('id, expo_push_token').eq('id', user_id).maybeSingle();
    if (!data) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    recipients = [data];
  } else {
    const { data } = await sb.from('users').select('id, expo_push_token').eq('role', 'client');
    recipients = data || [];
  }

  if (recipients.length === 0) {
    return NextResponse.json({ success: true, delivered: 0 });
  }

  // Insert one notification row per recipient.
  const rows = recipients.map((r) => ({
    user_id: r.id,
    for_admin: false,
    type,
    title,
    body: msg,
  }));
  const { error: insErr } = await sb.from('notifications').insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Best-effort Expo push per recipient with a token. No await on the batch;
  // fire-and-forget so a slow push service doesn't stall the response.
  const tokens = recipients.map((r) => r.expo_push_token).filter(Boolean);
  if (tokens.length > 0) {
    fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({ to, sound: 'default', title, body: msg }))),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, delivered: recipients.length });
}

// PATCH /api/notifications
//   { ids: [1,2,3] } — mark specific notifications as read
//   { all: true }    — mark all of my notifications as read
export async function PATCH(request: Request) {
  const admin = await getAdmin();
  const mobile = admin ? null : await getMobileUser(request);
  if (!admin && !mobile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sb = supabaseAdmin();
  const userId = admin?.id || mobile!.id;

  let q = sb.from('notifications').update({ read: true });
  q = admin
    ? q.or(`user_id.eq.${userId},for_admin.eq.true`)
    : q.eq('user_id', userId);

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    q = q.in('id', body.ids);
  } else if (!body.all) {
    return NextResponse.json({ error: 'Provide ids[] or all:true' }, { status: 400 });
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
