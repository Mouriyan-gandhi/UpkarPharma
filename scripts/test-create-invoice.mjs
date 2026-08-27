// One-off: back-fill a Draft invoice for an existing order so we can test the
// /api/invoices endpoints end-to-end without waiting on a mobile order.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Pick the newest order that doesn't have an invoice yet
const { data: orders } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(20);
const { data: existingInvoices } = await sb.from('invoices').select('order_id');
const invoicedIds = new Set((existingInvoices || []).map(i => i.order_id));
const target = orders.find(o => !invoicedIds.has(o.id));
if (!target) { console.log('All orders already have invoices'); process.exit(0); }

console.log('Target order:', target.id, target.store_name, '₹' + target.total);

const { data: user } = await sb.from('users')
  .select('store_name, phone, address, city, drug_license, gst_number')
  .eq('id', target.user_id).maybeSingle();

// Allocate invoice number
const { data: invNo } = await sb.rpc('next_invoice_no');
console.log('Allocated:', invNo);

// Compute totals
const subtotal = Number(target.total) / 1.12;   // reverse-derive from gross
const tax = Number(target.total) - subtotal;
const cgst = tax / 2, sgst = tax / 2;
const net = Number(target.total);
const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 60);

const { data: inv, error } = await sb.from('invoices').insert({
  invoice_no: invNo,
  order_id: target.id,
  user_id: target.user_id,
  status: 'Draft',
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: dueDate.toISOString().slice(0, 10),
  buyer_snapshot: user || {},
  subtotal: Math.round(subtotal * 100) / 100,
  discount: 0,
  tax_amount: Math.round(tax * 100) / 100,
  cgst: Math.round(cgst * 100) / 100,
  sgst: Math.round(sgst * 100) / 100,
  freight: 0,
  round_off: 0,
  net_amount: net,
  amount_in_words: 'TEST INVOICE',
}).select('*').single();

if (error) { console.error('❌', error.message); process.exit(1); }
console.log('✅ Created invoice:', inv.invoice_no, 'for order', inv.order_id);
console.log(`   Test URLs:`);
console.log(`     JSON: http://localhost:3000/api/invoices/${inv.order_id}`);
console.log(`     HTML: http://localhost:3000/api/invoices/${inv.order_id}/html`);
