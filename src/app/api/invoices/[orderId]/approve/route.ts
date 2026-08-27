import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// POST /api/invoices/[orderId]/approve
// Admin approves the invoice:
//   * invoice.status → Approved
//   * order.status   → Packaging
//   * customer notification inserted (realtime broadcasts)
//   * Expo push notification best-effort
export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { orderId } = await ctx.params;
  const sb = supabaseAdmin();

  const { data: invoice } = await sb.from('invoices')
    .select('id, invoice_no, status, user_id, net_amount, buyer_snapshot')
    .eq('order_id', orderId).maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.status !== 'Draft') {
    return NextResponse.json({ error: `Invoice already ${invoice.status}` }, { status: 400 });
  }

  // Approve the invoice
  const { error: iErr } = await sb.from('invoices').update({
    status: 'Approved',
    approved_at: new Date().toISOString(),
    approved_by: admin.id,
  }).eq('id', invoice.id);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  // Move the order forward
  await sb.from('orders').update({ status: 'Packaging' }).eq('id', orderId);

  // In-app notification (Realtime auto-broadcasts to the customer)
  await sb.from('notifications').insert({
    user_id: invoice.user_id,
    for_admin: false,
    type: 'invoice_ready',
    title: `Invoice ${invoice.invoice_no} approved`,
    body: `Your order ${orderId} is confirmed. Tap to view the invoice (₹${Number(invoice.net_amount).toFixed(2)}).`,
    meta: { order_id: orderId, invoice_no: invoice.invoice_no, net_amount: invoice.net_amount },
  });

  // Expo push (best-effort)
  const { data: user } = await sb.from('users')
    .select('expo_push_token').eq('id', invoice.user_id).maybeSingle();
  if (user?.expo_push_token) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: user.expo_push_token,
          sound: 'default',
          title: `Invoice ${invoice.invoice_no} approved`,
          body: `Order ${orderId} confirmed — invoice ready to view.`,
          data: { orderId, invoice_no: invoice.invoice_no, deeplink: `/orders/${orderId}` },
        }),
      });
    } catch (e) { console.error('Push error:', e); }
  }

  return NextResponse.json({ success: true, invoice_no: invoice.invoice_no });
}
