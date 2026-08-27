import { NextResponse } from 'next/server';
import { getAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { renderInvoiceHTML } from '@/lib/invoice';

// GET /api/invoices/[orderId]/html
// Returns the server-rendered HTML matching the UPKAR PHARMA invoice format.
// Used by the mobile WebView + as source for PDF generation.
//
// Query params:
//   ?token=<accessToken>  — mobile clients can pass their Supabase access token
//                            as a query param (WebView can't easily set headers)
export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await ctx.params;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');

  const admin = await getAdmin();

  // Try mobile auth from Authorization header first, then from ?token=
  let mobile = admin ? null : await getMobileUser(request);
  if (!admin && !mobile && queryToken) {
    // Build a synthetic Request that carries the token as bearer, reuse the helper.
    const req = new Request(request.url, {
      headers: { authorization: `Bearer ${queryToken}` },
    });
    mobile = await getMobileUser(req);
  }
  if (!admin && !mobile) {
    return htmlError(401, 'Unauthorized — please sign in.');
  }

  const sb = supabaseAdmin();
  const { data: invoice } = await sb.from('invoices').select('*').eq('order_id', orderId).maybeSingle();
  if (!invoice) return htmlError(404, 'Invoice not found for this order.');

  if (mobile && invoice.user_id !== mobile.id) {
    return htmlError(403, 'You do not have access to this invoice.');
  }

  const [{ data: order }, { data: items }] = await Promise.all([
    sb.from('orders').select('*').eq('id', orderId).maybeSingle(),
    sb.from('order_items').select('*').eq('order_id', orderId).order('id', { ascending: true }),
  ]);

  const html = renderInvoiceHTML({
    invoice,
    items: items || [],
    order: order || { id: orderId },
    buyer: invoice.buyer_snapshot,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function htmlError(status: number, message: string) {
  const body = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#666;">
    <h2>Invoice unavailable</h2>
    <p>${message}</p>
  </body></html>`;
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
