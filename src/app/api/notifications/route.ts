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
