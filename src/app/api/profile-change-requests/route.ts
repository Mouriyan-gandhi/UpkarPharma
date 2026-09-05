import { NextResponse } from 'next/server';
import { getAnyAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pushToAdmins, pushToUser } from '@/lib/push';

// Fields customers may request to change (all others are self-editable via
// /api/data update_address or profile screen directly).
const ALLOWED_KEYS = new Set([
  'store_name', 'gst_number', 'drug_license', 'registration_number', 'user_type',
]);

// GET — list requests
//   Customer: own only
//   Admin: all (or ?status=Pending for the review queue)
export async function GET(request: Request) {
  const admin = await getAnyAdmin(request);
  const mobile = admin ? null : await getMobileUser(request);
  if (!admin && !mobile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let q = sb.from('profile_change_requests').select('*').order('requested_at', { ascending: false });
  if (mobile) q = q.eq('user_id', mobile.id);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

// POST — customer submits a new change request
//   { changes: { gst_number: "22XXXX", drug_license: "..." }, reason?: "..." }
export async function POST(request: Request) {
  const mobile = await getMobileUser(request);
  if (!mobile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { changes, reason } = await request.json().catch(() => ({}));
  if (!changes || typeof changes !== 'object') {
    return NextResponse.json({ error: 'changes object required' }, { status: 400 });
  }

  // Only allow whitelisted fields
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (ALLOWED_KEYS.has(k) && typeof v === 'string' && v.trim()) {
      cleaned[k] = v.trim();
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Enforce one-pending-per-user (also enforced by unique index in DB).
  const { data: existing } = await sb.from('profile_change_requests')
    .select('id').eq('user_id', mobile.id).eq('status', 'Pending').maybeSingle();
  if (existing) {
    return NextResponse.json({
      error: 'You already have a pending request. Wait for admin to review it.',
    }, { status: 409 });
  }

  const { data, error } = await sb.from('profile_change_requests').insert({
    user_id: mobile.id,
    changes: cleaned,
    reason: reason || null,
    status: 'Pending',
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Real push to admins. The DB trigger inserts the bell row already, so
  // we only need to fire the push side here — pass a lightweight helper
  // that skips the duplicate bell insert.
  const fields = Object.keys(cleaned).join(', ');
  void pushToAdmins({
    type: 'profile_change_requested',
    title: 'Profile change request',
    body: `${mobile.store_name || 'A partner'} wants to update: ${fields}`,
    data: { request_id: data?.id, user_id: mobile.id, changes: cleaned },
  });
  return NextResponse.json({ success: true, request: data });
}

// POST admin approval/rejection is exposed via RPCs approve_profile_change /
// reject_profile_change — those are called from the admin panel directly.
// We could wrap them here for consistency:
// PATCH /api/profile-change-requests  { id, action: 'approve'|'reject', note? }
export async function PATCH(request: Request) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, action, note } = await request.json().catch(() => ({}));
  if (!id || !action) return NextResponse.json({ error: 'id + action required' }, { status: 400 });

  const sb = supabaseAdmin();
  const rpc = action === 'approve' ? 'approve_profile_change' : 'reject_profile_change';
  const { error } = await sb.rpc(rpc, { request_id: id, admin_note_text: note || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
