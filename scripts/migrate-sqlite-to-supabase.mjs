// ═══════════════════════════════════════════════════════════════════════════
// One-shot migration: SQLite (./database.sqlite) → Supabase Postgres
//
// Safe to re-run. Uses ON CONFLICT and lookup-then-skip for idempotency.
//
// Order matters because of foreign keys:
//   1. users        (creates auth.users + trigger auto-creates public.users)
//   2. products     (independent)
//   3. orders       (needs user_id from step 1)
//   4. order_items  (needs order_id and enriches from products)
//   5. schemes      (independent — currently empty)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// ── Load env ────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sqlite = new Database(path.join(rootDir, 'database.sqlite'), { readonly: true });

// Legacy "UNKNOWN" placeholder phone gets a synthetic E.164 phone so it can
// participate in FK relationships without being a real number.
const UNKNOWN_PHONE_SUBSTITUTE = '911111100000';   // no + prefix — E.164 numeric

// Normalize an SQLite phone into Supabase Auth E.164 format (no + in the input).
function toE164(rawPhone) {
  if (!rawPhone || rawPhone === 'UNKNOWN') return UNKNOWN_PHONE_SUBSTITUTE;
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return '91' + digits;
  return digits;
}

// Map old order status → new 3-stage lifecycle stage
function mapStatus(old) {
  const s = String(old || '').toLowerCase();
  if (s.includes('reject')) return 'Rejected';
  if (s.includes('ship') || s.includes('dispatch')) return 'Dispatch';
  if (s.includes('pack')) return 'Packaging';
  return 'Invoicing';
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 1 — Users
// ═══════════════════════════════════════════════════════════════════════════
async function migrateUsers() {
  console.log('\n═══ Step 1: users ═══');
  const rows = sqlite.prepare('SELECT * FROM users ORDER BY id ASC').all();

  // Build a phone→uid map from any auth users that already exist.
  const existingByPhone = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.phone) existingByPhone.set(u.phone, u.id);
    if (data.users.length < 200) break;
    page++;
  }
  console.log(`  ${existingByPhone.size} auth user(s) already exist`);

  const phoneToUid = new Map();
  let created = 0, skipped = 0;
  for (const r of rows) {
    const phone = toE164(r.phone);
    let uid = existingByPhone.get(phone);
    if (uid) {
      skipped++;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        phone,
        phone_confirm: true,
        password: r.role === 'admin' ? '123456' : undefined,   // preserve dev admin login
        user_metadata: { store_name: r.store_name, migrated_from: 'sqlite' },
      });
      if (error) {
        console.error(`  ❌ create auth user for ${phone}:`, error.message);
        continue;
      }
      uid = data.user.id;
      created++;
    }
    phoneToUid.set(r.phone, uid);

    // Upsert the public.users row with the full profile.
    // (The trigger auto-created a partial row on auth insert; fill in the rest.)
    const { error: upErr } = await supabase.from('users').upsert({
      id: uid,
      phone,
      store_name: r.store_name || 'Unnamed',
      role: r.role || 'client',
      is_approved: !!r.is_approved,
      is_blocked: !!r.is_blocked,
      blocked_reason: r.blocked_reason,
      credit_balance: Number(r.credit_balance) || 0,
      credit_limit: Number(r.credit_limit) || 0,
      expo_push_token: r.expo_push_token,
      drug_license: r.drug_license,
      gst_number: r.gst_number,
      registration_number: r.registration_number,
      address: r.address,
      email: r.email,
      user_type: r.user_type,
      zone: r.zone,
      city: r.city,
    }, { onConflict: 'id' });
    if (upErr) console.error(`  ❌ upsert public.users for ${phone}:`, upErr.message);
  }
  console.log(`  Users: ${created} created, ${skipped} already existed, ${phoneToUid.size} total mapped.`);
  return phoneToUid;
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 2 — Products (batched)
// ═══════════════════════════════════════════════════════════════════════════
async function migrateProducts() {
  console.log('\n═══ Step 2: products ═══');
  const rows = sqlite.prepare('SELECT * FROM products ORDER BY id ASC').all();
  console.log(`  ${rows.length} product rows in SQLite`);

  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      company: p.company,
      manufacturer: p.company,               // company field ~= mfr in old schema
      category: p.category,
      body_system: p.body_system,
      drug_name: p.drug_name,
      composition: p.composition,
      description: p.description,
      packing: p.packing,
      hsn: p.hsn,
      gst_percent: p.gst_percent,
      price: Number(p.price) || 0,
      price_ptr: p.price_ptr,
      pts: p.pts,
      pur_rate: p.pur_rate,
      sal_rate: p.sal_rate,
      mrp: p.mrp,
      stock: p.stock ?? 0,
      stock_status: p.stock_status,
      distributor: p.distributor,
      supplier: p.supplier,
      segregation: p.segregation,
      matched_brochure_page: p.matched_brochure_page,
      image_url: p.image_url,
      images: p.image_url ? [p.image_url] : [],
    }));
    const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`  ❌ batch ${i}-${i + batch.length}:`, error.message);
      return;
    }
    done += batch.length;
    process.stdout.write(`\r  Upserted ${done} / ${rows.length}`);
  }
  console.log('');

  // Note: after migration, run this one-liner in Supabase SQL Editor to bump
  // the id sequence past the max we just inserted (else the next new product
  // insert would collide):
  //   SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 1));
  console.log("  (After all steps: run 'SELECT setval(''products_id_seq'', (SELECT MAX(id) FROM products));' in SQL Editor.)");
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 3 — Orders
// ═══════════════════════════════════════════════════════════════════════════
async function migrateOrders(phoneToUid) {
  console.log('\n═══ Step 3: orders ═══');
  const rows = sqlite.prepare('SELECT * FROM orders ORDER BY created_at ASC').all();
  console.log(`  ${rows.length} orders`);

  for (const r of rows) {
    const userId = phoneToUid.get(r.user_phone);
    if (!userId) {
      console.error(`  ❌ ${r.id}: no user_id for phone ${r.user_phone}, skipping`);
      continue;
    }
    const { error } = await supabase.from('orders').upsert({
      id: r.id,
      user_id: userId,
      user_phone: toE164(r.user_phone),
      store_name: r.store_name,
      status: mapStatus(r.status),
      subtotal: 0,
      discount_value: 0,
      gst: 0,
      total: Number(r.total) || 0,
      scheme_code: r.scheme_code,
      courier_name: r.courier_name,
      tracking_id: r.tracking_id,
      date: r.date || new Date(r.created_at || Date.now()).toLocaleDateString('en-GB'),
    }, { onConflict: 'id' });
    if (error) console.error(`  ❌ ${r.id}:`, error.message);
  }
  console.log('  Orders migrated.');
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 4 — Order items (with snapshot enrichment from products)
// ═══════════════════════════════════════════════════════════════════════════
async function migrateOrderItems() {
  console.log('\n═══ Step 4: order_items ═══');
  const rows = sqlite.prepare(`
    SELECT oi.*,
           p.name AS product_name,
           p.packing,
           p.hsn,
           p.gst_percent,
           p.mrp,
           p.company AS mfr
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    ORDER BY oi.id ASC
  `).all();
  console.log(`  ${rows.length} order items`);

  const batch = rows.map(r => ({
    order_id: r.order_id,
    product_id: r.product_id,
    product_name: r.product_name || 'Legacy Item',
    packing: r.packing,
    hsn: r.hsn,
    gst_percent: r.gst_percent,
    mrp: r.mrp,
    mfr: r.mfr,
    quantity: r.quantity,
    free_quantity: 0,
    price_at_time: Number(r.price_at_time) || 0,
    discount_percent: 0,
  }));

  if (batch.length === 0) return;
  const { error } = await supabase.from('order_items').insert(batch);
  if (error) console.error('  ❌', error.message);
  else console.log('  Order items migrated.');
}

// ═══════════════════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════════════════
console.log('Migration: SQLite → Supabase Postgres');
console.log('  Source :', path.join(rootDir, 'database.sqlite'));
console.log('  Target :', env.NEXT_PUBLIC_SUPABASE_URL);

const phoneToUid = await migrateUsers();
await migrateProducts();
await migrateOrders(phoneToUid);
await migrateOrderItems();

console.log('\n✅ Migration complete. Verifying row counts…\n');

async function count(table) {
  const { count, error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
  return error ? '???' : count;
}

for (const t of ['users', 'products', 'orders', 'order_items', 'invoices', 'schemes']) {
  const sqliteCount = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const pgCount = await count(t);
  const ok = sqliteCount === pgCount ? '✅' : '⚠️ ';
  console.log(`  ${ok} ${t.padEnd(15)} SQLite: ${String(sqliteCount).padStart(5)}   Postgres: ${String(pgCount).padStart(5)}`);
}
