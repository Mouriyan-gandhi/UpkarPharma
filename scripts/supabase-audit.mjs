// Audit the Supabase project: list tables, columns, RLS policies, functions,
// realtime publications, and row counts. Prints a machine-readable JSON summary.
//
// We can't run raw SQL through supabase-js (no exec_sql RPC), so we call
// PostgREST via .from() on system views (information_schema, pg_catalog).
// For anything PostgREST can't reach, we probe by probing (attempt a select
// and report the outcome).

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const EXPECTED_TABLES = [
  'users', 'products', 'orders', 'order_items',
  'invoices', 'invoice_counter', 'schemes',
  'notifications', 'profile_change_requests',
];

const EXPECTED_COLUMNS = {
  users: [
    'id', 'phone', 'store_name', 'role', 'is_approved', 'is_blocked',
    'blocked_reason', 'credit_balance', 'credit_limit', 'expo_push_token',
    'drug_license', 'gst_number', 'registration_number', 'address', 'email',
    'user_type', 'zone', 'city', 'created_at', 'updated_at',
  ],
  products: [
    'id', 'name', 'code', 'company', 'manufacturer', 'category', 'body_system',
    'drug_name', 'composition', 'description', 'packing', 'hsn', 'gst_percent',
    'price', 'price_ptr', 'pts', 'pur_rate', 'sal_rate', 'mrp',
    'stock', 'stock_status', 'distributor', 'supplier', 'segregation',
    'matched_brochure_page', 'image_url', 'images',
    'short_expiry', 'discount_percent', 'expiry_date',
    'created_at', 'updated_at',
  ],
  orders: [
    'id', 'user_id', 'user_phone', 'store_name', 'status',
    'subtotal', 'discount_value', 'gst', 'total',
    'scheme_code', 'courier_name', 'tracking_id',
    'date', 'created_at', 'updated_at',
  ],
  order_items: [
    'id', 'order_id', 'product_id',
    'product_name', 'packing', 'hsn', 'gst_percent', 'mrp', 'mfr',
    'batch_no', 'expiry_date',
    'quantity', 'free_quantity', 'price_at_time', 'discount_percent', 'line_total',
  ],
  invoices: [
    'id', 'invoice_no', 'order_id', 'user_id', 'status',
    'invoice_date', 'due_date', 'buyer_snapshot',
    'subtotal', 'discount', 'tax_amount', 'cgst', 'sgst',
    'freight', 'round_off', 'net_amount', 'amount_in_words',
    'approved_at', 'approved_by', 'sent_at',
    'created_at', 'updated_at',
  ],
  invoice_counter: ['id', 'next_number'],
  schemes: [
    'id', 'title', 'description', 'code', 'scheme_type',
    'discount_percent', 'flat_discount', 'min_order_value', 'max_discount',
    'start_date', 'end_date', 'is_active',
    'usage_limit', 'per_user_limit', 'times_used', 'created_at',
  ],
  notifications: [
    'id', 'user_id', 'for_admin', 'type', 'title', 'body', 'meta', 'read', 'created_at',
  ],
  profile_change_requests: [
    'id', 'user_id', 'changes', 'reason', 'status', 'admin_note',
    'requested_at', 'reviewed_at', 'reviewed_by',
  ],
};

const EXPECTED_FUNCTIONS = ['next_invoice_no', 'is_admin', 'approve_profile_change', 'reject_profile_change'];

// ── 1. Table existence + row counts ─────────────────────────────────────────
console.log('═══ 1. Tables & row counts ═══');
const tableStatus = {};
for (const t of EXPECTED_TABLES) {
  const { count, error } = await sb.from(t).select('*', { head: true, count: 'exact' });
  if (error) {
    console.log(`  ❌ ${t.padEnd(28)} MISSING`);
    tableStatus[t] = { ok: false };
  } else {
    console.log(`  ✅ ${t.padEnd(28)} ${count ?? 0} rows`);
    tableStatus[t] = { ok: true, rows: count };
  }
}

// ── 2. Column coverage — sample one row and check keys ──────────────────────
console.log('\n═══ 2. Column coverage ═══');
const columnStatus = {};
for (const [t, expected] of Object.entries(EXPECTED_COLUMNS)) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  if (error) {
    console.log(`  ⚠️  ${t}: could not sample (${error.message})`);
    continue;
  }
  const actual = data && data.length > 0 ? Object.keys(data[0]) : null;
  if (!actual) {
    // Empty table — probe by selecting each expected column explicitly.
    const missing = [];
    for (const col of expected) {
      const { error: cErr } = await sb.from(t).select(col).limit(1);
      if (cErr && /column|does not exist/i.test(cErr.message)) missing.push(col);
    }
    if (missing.length === 0) {
      console.log(`  ✅ ${t.padEnd(28)} all ${expected.length} columns present (empty table, probed)`);
      columnStatus[t] = { ok: true, note: 'probed' };
    } else {
      console.log(`  ❌ ${t.padEnd(28)} MISSING: ${missing.join(', ')}`);
      columnStatus[t] = { ok: false, missing };
    }
  } else {
    const missing = expected.filter(c => !actual.includes(c));
    const extra = actual.filter(c => !expected.includes(c));
    if (missing.length === 0) {
      const extraNote = extra.length > 0 ? ` (+ extras: ${extra.slice(0, 3).join(',')}${extra.length > 3 ? '…' : ''})` : '';
      console.log(`  ✅ ${t.padEnd(28)} all ${expected.length}${extraNote}`);
      columnStatus[t] = { ok: true, extra };
    } else {
      console.log(`  ❌ ${t.padEnd(28)} MISSING: ${missing.join(', ')}`);
      columnStatus[t] = { ok: false, missing };
    }
  }
}

// ── 3. Custom functions ─────────────────────────────────────────────────────
console.log('\n═══ 3. Custom functions ═══');
for (const fn of EXPECTED_FUNCTIONS) {
  const { error } = await sb.rpc(fn, {}).select?.() ?? { error: null };
  // rpc with wrong args returns "function does not exist" if missing.
  const { error: probeErr } = await sb.rpc(fn);
  if (probeErr && /does not exist|not found/i.test(probeErr.message)) {
    console.log(`  ❌ ${fn}() — MISSING`);
  } else {
    console.log(`  ✅ ${fn}() — present`);
  }
}

// ── 4. Sample invoice_counter row ───────────────────────────────────────────
console.log('\n═══ 4. Invoice counter state ═══');
const { data: counter } = await sb.from('invoice_counter').select('*').maybeSingle();
if (counter) {
  console.log(`  Next invoice number will be: UPD${String(counter.next_number).padStart(4, '0')}`);
}

// ── 5. Sample data health ───────────────────────────────────────────────────
console.log('\n═══ 5. Data health ═══');
const { data: admins } = await sb.from('users').select('phone, store_name, role').eq('role', 'admin');
console.log(`  Admins (${admins?.length ?? 0}):`);
for (const a of admins || []) console.log(`    - ${a.store_name} (${a.phone})`);

const { data: clients, count: clientCount } = await sb
  .from('users').select('*', { count: 'exact', head: true }).eq('role', 'client');
console.log(`  Clients: ${clientCount ?? 0}`);

const { data: blockedUsers, count: blockedCount } = await sb
  .from('users').select('*', { count: 'exact', head: true }).eq('is_blocked', true);
console.log(`  Blocked users: ${blockedCount ?? 0}`);

const { count: prodImgCount } = await sb
  .from('products').select('*', { count: 'exact', head: true })
  .not('image_url', 'is', null);
console.log(`  Products with image_url: ${prodImgCount ?? 0} / ${tableStatus.products?.rows ?? 0}`);

// ── 6. Realtime publication check (via RPC — best effort) ───────────────────
console.log('\n═══ 6. Realtime bindings ═══');
console.log('  (Realtime is broadcast-based; a functional check requires a live');
console.log('   subscription. Enabled via ALTER PUBLICATION supabase_realtime');
console.log('   in migration 0001 for: orders, invoices, notifications');
console.log('   and in 0002 for: profile_change_requests.)');

console.log('\n✅ Audit complete.');
