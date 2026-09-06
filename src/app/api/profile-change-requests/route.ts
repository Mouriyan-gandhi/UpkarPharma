import { NextResponse } from 'next/server';
import { getAnyAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pushToAdmins, pushToUser } from '@/lib/push';

// Fields customers may request to change (all others are self-editable via
// /api/data update_address or profile screen directly).
// Fields customers may request to change. store_name / GSTIN / drug licence /
// registration are compliance-critical; address is invoice-critical (delivery
// destination changes the tax address); user_type is *not* here since it's
// self-classification and self-editable via update_own_profile.
const ALLOWED_KEYS = new Set([
  'store_name', 'gst_number', 'drug_license', 'registration_number', 'address',
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

// PATCH /api/profile-change-requests  { id, action: 'approve'|'reject', note? }
// Bypasses the original approve_profile_change SQL RPC because that RPC has a
// hardcoded 5-field allowlist and doesn't know about address. Doing the merge
// in JS lets us stay aligned with ALLOWED_KEYS above without a new migration
// every time we add a whitelisted field.
export async function PATCH(request: Request) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, action, note } = await request.json().catch(() => ({}));
  if (!id || !action) return NextResponse.json({ error: 'id + action required' }, { status: 400 });
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve|reject' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: req, error: rErr } = await sb.from('profile_change_requests')
    .select('*').eq('id', id).maybeSingle();
  if (rErr || !req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (req.status !== 'Pending') {
    return NextResponse.json({ error: `Request already ${req.status.toLowerCase()}` }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  if (action === 'approve') {
    // Apply only whitelisted keys, keeping existing values otherwise.
    const patch: any = {};
    for (const [k, v] of Object.entries(req.changes || {})) {
      if (ALLOWED_KEYS.has(k) && typeof v === 'string') patch[k] = v;
    }
    if (Object.keys(patch).length > 0) {
      const { error: uErr } = await sb.from('users').update(patch).eq('id', req.user_id);
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
  }

  const { error: pErr } = await sb.from('profile_change_requests').update({
    status: action === 'approve' ? 'Approved' : 'Rejected',
    admin_note: note || null,
    reviewed_at: nowIso,
    reviewed_by: admin.id,
  }).eq('id', id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // Notify the customer
  const { pushToUser } = await import('@/lib/push');
  void pushToUser(req.user_id, {
    type: action === 'approve' ? 'profile_change_approved' : 'profile_change_rejected',
    title: action === 'approve' ? 'Profile update approved' : 'Profile update declined',
    body: action === 'approve'
      ? `Your requested profile updates are live.`
      : (note || 'Your profile change was not approved. Contact support for details.'),
    data: { request_id: id, changes: req.changes },
  });

  return NextResponse.json({ success: true });
}
