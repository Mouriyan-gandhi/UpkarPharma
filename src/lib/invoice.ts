import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPANY } from './upkem-company';

// ────────────────────────────────────────────────────────────────────────────
// Number → words (Indian numbering system with lakh/crore).
// Used for the "RUPEES … ONLY" line at the bottom of the invoice.
// ────────────────────────────────────────────────────────────────────────────
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function upTo99(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}
function upTo999(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' HUNDRED' + (r ? ' ' : '') : '') + (r ? upTo99(r) : '');
}
export function numberToWordsIndian(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'ZERO ONLY';

  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  if (crore) parts.push(upTo999(crore) + ' CRORE');
  if (lakh) parts.push(upTo999(lakh) + ' LAKH');
  if (thousand) parts.push(upTo999(thousand) + ' THOUSAND');
  if (rest) parts.push(upTo999(rest));
  let out = parts.join(' ').trim();
  if (paise > 0) out += ' AND ' + upTo99(paise) + ' PAISE';
  return out + ' ONLY';
}

// ────────────────────────────────────────────────────────────────────────────
// Create a Draft invoice for a freshly-created order.
// Uses next_invoice_no() to atomically allocate the UPD number.
// ────────────────────────────────────────────────────────────────────────────
export type BuyerSnapshot = {
  store_name: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  drug_license?: string | null;
  gst_number?: string | null;
};

export type InvoiceComputeInput = {
  subtotal: number;
  discount: number;
  gst_percent_default?: number;   // default 12; per-line rates come from items
  freight?: number;
};

export function computeInvoiceTotals({
  subtotal, discount, freight = 0,
}: InvoiceComputeInput) {
  const taxable = Math.max(0, subtotal - discount);
  // Split into equal CGST + SGST at 6% each (12% total) matching the mobile
  // template. Per-slab breakdown is done in the HTML render.
  const tax_amount = Math.round(taxable * 0.12 * 100) / 100;
  const cgst = Math.round(tax_amount / 2 * 100) / 100;
  const sgst = Math.round(tax_amount / 2 * 100) / 100;
  const gross = taxable + tax_amount + freight;
  const net_amount = Math.round(gross);
  const round_off = Math.round((net_amount - gross) * 100) / 100;
  return { taxable, tax_amount, cgst, sgst, freight, round_off, net_amount };
}

export async function createDraftInvoiceForOrder(sb: SupabaseClient, opts: {
  order_id: string;
  user_id: string;
  buyer: BuyerSnapshot;
  subtotal: number;
  discount: number;
  freight?: number;
}) {
  // Allocate the next invoice number atomically via the SQL function.
  const { data: nextNo, error: nErr } = await sb.rpc('next_invoice_no');
  if (nErr) throw nErr;

  const totals = computeInvoiceTotals(opts);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 60);

  const row = {
    invoice_no: nextNo as string,
    order_id: opts.order_id,
    user_id: opts.user_id,
    status: 'Draft',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: dueDate.toISOString().slice(0, 10),
    buyer_snapshot: opts.buyer,
    subtotal: opts.subtotal,
    discount: opts.discount,
    tax_amount: totals.tax_amount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    freight: totals.freight,
    round_off: totals.round_off,
    net_amount: totals.net_amount,
    amount_in_words: numberToWordsIndian(totals.net_amount),
  };

  const { data: invoice, error: iErr } = await sb.from('invoices').insert(row).select('*').single();
  if (iErr) throw iErr;
  return invoice;
}

// ────────────────────────────────────────────────────────────────────────────
// HTML rendering — matches the UPKAR PHARMA sample invoice layout.
// Consumed by:
//   * mobile WebView (order success + order history "View Invoice")
//   * PDF generation via expo-print on the client
//   * admin panel iframe preview
// ────────────────────────────────────────────────────────────────────────────
export function renderInvoiceHTML(opts: {
  invoice: any;              // invoices row
  items: any[];              // order_items rows
  buyer: BuyerSnapshot;
  order: { id: string; date?: string; store_name?: string };
}): string {
  const { invoice, items, buyer, order } = opts;

  const totalQty = items.reduce((a, i) => a + (i.quantity || 0), 0);

  const rows = items.map((it, idx) => `
    <tr>
      <td class="c">${idx + 1}</td>
      <td><strong>${escapeHtml(it.product_name || '')}</strong></td>
      <td class="c">${escapeHtml(it.packing || '')}</td>
      <td class="c">${escapeHtml(it.mfr || '')}</td>
      <td class="c">${escapeHtml(it.hsn || '')}</td>
      <td class="c">${escapeHtml(it.batch_no || '—')}</td>
      <td class="c">${escapeHtml(it.expiry_date || '—')}</td>
      <td class="c">${it.quantity}</td>
      <td class="c">${it.free_quantity || 0}</td>
      <td class="r">₹${Number(it.mrp || 0).toFixed(2)}</td>
      <td class="r">₹${Number(it.price_at_time || 0).toFixed(2)}</td>
      <td class="c">${it.discount_percent || 0}%</td>
      <td class="c">${it.gst_percent || 12}%</td>
      <td class="r">₹${Number(it.line_total ?? (it.price_at_time * it.quantity)).toFixed(2)}</td>
    </tr>`).join('');

  const statusBadge = invoice.status === 'Draft'
    ? `<span class="badge badge-draft">DRAFT</span>`
    : invoice.status === 'Approved'
    ? `<span class="badge badge-approved">APPROVED</span>`
    : invoice.status === 'Sent'
    ? `<span class="badge badge-sent">SENT</span>`
    : `<span class="badge badge-cancelled">CANCELLED</span>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${invoice.invoice_no}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 16px; background: #fff; }
    .wrap { border: 2px solid #1a1a1a; }
    .r { text-align: right; } .c { text-align: center; }

    .row { display: flex; border-bottom: 2px solid #1a1a1a; }
    .row:last-child { border-bottom: none; }

    /* Header: company + bank */
    .co { flex: 2; padding: 12px; border-right: 2px solid #1a1a1a; }
    .co-name { font-size: 18px; font-weight: 900; text-align: center; letter-spacing: 1px; }
    .co-addr { font-size: 10px; text-align: center; line-height: 1.5; color: #333; margin-top: 4px; }
    .co-gst  { font-size: 10px; font-weight: 700; margin-top: 4px; text-align: center; }
    .bank { flex: 1; padding: 8px; font-size: 10px; }
    .bank-title { font-weight: 900; font-size: 11px; text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 4px; }
    .bank-row { display: flex; justify-content: space-between; padding: 1px 0; }
    .bank-label { font-weight: 700; color: #555; }

    /* Buyer + invoice meta */
    .buyer { flex: 1; padding: 8px; border-right: 2px solid #1a1a1a; font-size: 10px; line-height: 1.6; }
    .meta  { flex: 1; padding: 0 8px 8px; font-size: 10px; }
    .title { text-align: center; font-size: 14px; font-weight: 900; padding: 6px; background: #f0fff4; border-bottom: 1px solid #1a1a1a; letter-spacing: 2px; margin: -8px -8px 6px; }
    .meta-label { font-weight: 700; color: #555; display: inline-block; min-width: 84px; }
    .meta-val   { font-weight: 700; color: #1a1a1a; }

    /* Line items */
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0fff4; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 4px; border: 1px solid #1a1a1a; color: #1B4332; }
    td { padding: 5px 4px; border: 1px solid #ddd; font-size: 10px; }
    tr:nth-child(even) td { background: #fafffe; }

    /* Totals */
    .totals-bar { display: flex; justify-content: space-between; padding: 6px 8px; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; font-size: 10px; font-weight: 700; background: #f0fff4; }
    .summary { display: flex; border-top: 2px solid #1a1a1a; }
    .gst-tab { flex: 1; border-right: 2px solid #1a1a1a; }
    .gst-tab table { font-size: 9px; }
    .gst-tab th, .gst-tab td { padding: 3px 6px; border: 1px solid #ccc; }
    .amount { flex: 1; padding: 4px 8px; }
    .amount-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .amount-label { color: #555; }
    .amount-val   { font-weight: 700; text-align: right; }
    .net { font-size: 16px; font-weight: 900; color: #1B4332; border-top: 2px solid #1a1a1a; padding-top: 6px; margin-top: 4px; display: flex; justify-content: space-between; }

    .words { padding: 6px 8px; border-top: 1px solid #1a1a1a; font-size: 10px; font-weight: 600; background: #f8fffe; }
    .footer { padding: 8px; border-top: 2px solid #1a1a1a; display: flex; justify-content: space-between; font-size: 9px; }
    .terms { color: #666; line-height: 1.5; max-width: 60%; }
    .sig { text-align: right; font-weight: 800; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 900; letter-spacing: 1px; }
    .badge-draft    { background: #fef3c7; color: #92400e; }
    .badge-approved { background: #d1fae5; color: #065f46; }
    .badge-sent     { background: #dbeafe; color: #1e40af; }
    .badge-cancelled{ background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="wrap">

    <!-- Header -->
    <div class="row">
      <div class="co">
        <div class="co-name">${COMPANY.name}</div>
        <div class="co-addr">
          ${COMPANY.address.replace(/\n/g, '<br/>')}<br/>
          Mail: ${COMPANY.email}<br/>
          Mobile: ${COMPANY.mobile}
        </div>
        <div class="co-gst">GST No: ${COMPANY.gstin} &nbsp;&nbsp; DL NO: ${COMPANY.dl_no}</div>
      </div>
      <div class="bank">
        <div class="bank-title">BANK DETAILS</div>
        <div class="bank-row"><span class="bank-label">Bank</span><span>: ${COMPANY.bank.name}</span></div>
        <div class="bank-row"><span class="bank-label">Branch</span><span>: ${COMPANY.bank.branch}</span></div>
        <div class="bank-row"><span class="bank-label">A/C NO</span><span>: ${COMPANY.bank.ac_no}</span></div>
        <div class="bank-row"><span class="bank-label">IFSC</span><span>: ${COMPANY.bank.ifsc}</span></div>
        <div style="text-align:center; margin-top:6px; font-weight:700; font-size:9px;">Q/R CODE</div>
      </div>
    </div>

    <!-- Buyer + meta -->
    <div class="row">
      <div class="buyer">
        <strong style="font-size:12px;">${escapeHtml(buyer.store_name)}</strong><br/>
        ${escapeHtml(buyer.address || 'Address not provided')}${buyer.city ? '<br/>' + escapeHtml(buyer.city) : ''}<br/>
        Mob: ${escapeHtml(buyer.phone)}
        ${buyer.drug_license ? '<br/>DL No: ' + escapeHtml(buyer.drug_license) : ''}
        ${buyer.gst_number ? '<br/>GST No: <strong>' + escapeHtml(buyer.gst_number) + '</strong>' : ''}
      </div>
      <div class="meta">
        <div class="title">GST Invoice ${statusBadge}</div>
        <span class="meta-label">Inv No</span> <span class="meta-val">: ${invoice.invoice_no}</span><br/>
        <span class="meta-label">Order</span>  <span class="meta-val">: ${order.id}</span><br/>
        <span class="meta-label">Date</span>   <span class="meta-val">: ${formatDate(invoice.invoice_date)}</span><br/>
        <span class="meta-label">Due Date</span><span class="meta-val">: ${formatDate(invoice.due_date)}</span><br/>
        <span class="meta-label">Mobile</span> <span class="meta-val">: ${COMPANY.mobile}</span>
      </div>
    </div>

    <!-- Items -->
    <table>
      <thead>
        <tr>
          <th>Sno</th><th>Product Name</th><th>Pack</th><th>Mfr</th><th>HSN</th>
          <th>Batch</th><th>Exp</th><th>Qty</th><th>Free</th>
          <th>MRP</th><th>Rate</th><th>Disc</th><th>GST%</th><th>Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-bar">
      <span>Total Items: ${items.length}</span>
      <span>Total Qty: ${totalQty}</span>
      <span>Total Outstanding: —</span>
    </div>

    <div class="summary">
      <div class="gst-tab">
        <table>
          <tr><th>Sales</th><th>GST-0%</th><th>GST-5%</th><th>GST-12%</th><th>GST-18%</th><th>GST-28%</th></tr>
          <tr><td><strong>GST/IGST</strong></td><td></td><td></td><td>₹${Number(invoice.subtotal - invoice.discount).toFixed(2)}</td><td></td><td></td></tr>
          <tr><td><strong>GST TAX</strong></td><td></td><td></td><td>₹${Number(invoice.tax_amount).toFixed(2)}</td><td></td><td></td></tr>
          <tr><td><strong>CGST</strong></td><td></td><td></td><td>6% ₹${Number(invoice.cgst).toFixed(2)}</td><td>9%</td><td>14%</td></tr>
          <tr><td><strong>SGST</strong></td><td></td><td></td><td>6% ₹${Number(invoice.sgst).toFixed(2)}</td><td>9%</td><td>14%</td></tr>
        </table>
      </div>
      <div class="amount">
        <div class="amount-row"><span class="amount-label">Sub Total</span><span class="amount-val">₹${Number(invoice.subtotal).toFixed(2)}</span></div>
        <div class="amount-row"><span class="amount-label">Discount</span><span class="amount-val">₹${Number(invoice.discount).toFixed(2)}</span></div>
        <div class="amount-row"><span class="amount-label">Tax Amount</span><span class="amount-val">₹${Number(invoice.tax_amount).toFixed(2)}</span></div>
        <div class="amount-row"><span class="amount-label">Freight</span><span class="amount-val">₹${Number(invoice.freight).toFixed(2)}</span></div>
        <div class="amount-row"><span class="amount-label">Round off</span><span class="amount-val">₹${Number(invoice.round_off).toFixed(2)}</span></div>
        <div class="net"><span>Net Amount</span><span>₹${Number(invoice.net_amount).toFixed(2)}</span></div>
      </div>
    </div>

    <div class="words">${escapeHtml(invoice.amount_in_words || '')}</div>

    <div class="footer">
      <div class="terms">
        <strong>Terms &amp; Conditions:</strong><br/>
        ${COMPANY.terms.map((t, i) => `${i + 1}. ${escapeHtml(t)}`).join('<br/>')}
      </div>
      <div class="sig">
        For <strong>${COMPANY.name}</strong>
        <br/><br/><br/>
        Authorised Signatory
      </div>
    </div>

  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
