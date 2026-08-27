import { NextResponse } from 'next/server';
import { getAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/invoices/[orderId]
// Returns { invoice, items, order, buyer } for an order.
// Admins can read any invoice; customers can read only their own.
export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await ctx.params;
  if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  const admin = await getAdmin();
  const mobile = admin ? null : await getMobileUser(request);
  if (!admin && !mobile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: invoice, error: invErr } = await sb
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  // Ownership check for customers
  if (mobile && invoice.user_id !== mobile.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: order }, { data: items }] = await Promise.all([
    sb.from('orders').select('*').eq('id', orderId).maybeSingle(),
    sb.from('order_items').select('*').eq('order_id', orderId).order('id', { ascending: true }),
  ]);

  return NextResponse.json({
    invoice,
    order,
    items: items || [],
    buyer: invoice.buyer_snapshot,
  });
}
