import { NextResponse } from 'next/server';
import { getAnyAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// PATCH /api/credit-requests/:id { action: 'approve' | 'reject', admin_note? }
//
// Admin-only. Runs the DB helper (approve_credit_request / reject_credit_request)
// which atomically bumps the customer's credit_limit and fires a notification.

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: 'Bad request id' }, { status: 400 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const action = String(body?.action || '').toLowerCase();
  const adminNote = typeof body?.admin_note === 'string' ? body.admin_note.slice(0, 500) : null;

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // The DB helpers use auth.uid() + is_admin() checks. Service-role bypasses
  // RLS so we replicate the amount+limit bump + notification in JS to avoid
  // depending on the RPC's admin gate matching service-role identity.
  const { data: req, error: reqErr } = await sb.from('credit_requests')
    .select('*').eq('id', requestId).single();
  if (reqErr || !req) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (req.status !== 'Pending') {
    return NextResponse.json({ error: `Request already ${req.status.toLowerCase()}` }, { status: 409 });
  }

  const reviewerId = admin.id;

  if (action === 'approve') {
    const { data: user } = await sb.from('users')
      .select('credit_limit, store_name')
      .eq('id', req.user_id).single();
    const newLimit = Number(user?.credit_limit || 0) + Number(req.amount);
    const { error: uErr } = await sb.from('users')
      .update({ credit_limit: newLimit })
      .eq('id', req.user_id);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error: patchErr } = await sb.from('credit_requests').update({
    status: action === 'approve' ? 'Approved' : 'Rejected',
    admin_note: adminNote,
    reviewed_at: nowIso,
    reviewed_by: reviewerId || null,
  }).eq('id', requestId);
  if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

  // Customer notification
  await sb.from('notifications').insert({
    user_id: req.user_id,
    for_admin: false,
    type: action === 'approve' ? 'credit_request_approved' : 'credit_request_rejected',
    title: action === 'approve' ? 'Credit request approved' : 'Credit request declined',
    body: action === 'approve'
      ? `Your request for ₹${Number(req.amount).toLocaleString('en-IN')} additional credit has been approved.`
      : (adminNote || 'Your credit request was not approved. Contact support for details.'),
    meta: { request_id: requestId, amount: req.amount },
  });

  return NextResponse.json({ success: true });
}
