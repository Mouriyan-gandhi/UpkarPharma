import { NextResponse } from 'next/server';
import { getAnyAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// PATCH /api/invoices/[orderId]/lines
// Admin updates batch_no + expiry_date per order_item.
// Only allowed while the invoice is Draft.
//
// Body: { lines: [{ id, batch_no, expiry_date }, ...] }
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { orderId } = await ctx.params;
  const { lines } = await request.json().catch(() => ({}));
  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: 'lines[] required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: invoice } = await sb.from('invoices')
    .select('status, order_id')
    .eq('order_id', orderId).maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.status !== 'Draft') {
    return NextResponse.json({ error: `Invoice is ${invoice.status}, cannot edit line items` }, { status: 400 });
  }

  const errors: string[] = [];
  for (const line of lines) {
    if (!line.id) continue;
    const patch: any = {};
    if (line.batch_no !== undefined) patch.batch_no = line.batch_no || null;
    if (line.expiry_date !== undefined) patch.expiry_date = line.expiry_date || null;
    // Whitelist safety — no other fields editable via this endpoint.
    const { error } = await sb.from('order_items')
      .update(patch).eq('id', line.id).eq('order_id', orderId);
    if (error) errors.push(`Line ${line.id}: ${error.message}`);
  }

  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }
  return NextResponse.json({ success: true, updated: lines.length });
}
