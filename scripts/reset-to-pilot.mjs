// Reset auth + public.users to a clean pilot state:
//   - Keep ONE admin: Dhruv Gandhi (+916379019139)
//   - Keep ONE customer: Pharma (+919999999999) with ₹10L credit, balance 0
//   - Delete everyone else (both public.users AND auth.users) — cascade
//     cleans up any related order rows.
//   - Reset the Pharma customer's password so we know it.
//
// Run: node scripts/reset-to-pilot.mjs --confirm
// (dry-run by default)

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const KEEP_ADMIN_PHONE = '916379019139';       // Dhruv
const KEEP_CUSTOMER_PHONE = '919999999999';     // Pharma
const NEW_CUSTOMER_STORE = 'Pharma';
const NEW_CUSTOMER_CREDIT_LIMIT = 1_000_000;

const confirmed = process.argv.includes('--confirm');

// 1. List everyone
const { data: users } = await sb.from('users').select('id, phone, role, store_name');
const toDelete = (users || []).filter(u => u.phone !== KEEP_ADMIN_PHONE && u.phone !== KEEP_CUSTOMER_PHONE);
const toKeep = (users || []).filter(u => u.phone === KEEP_ADMIN_PHONE || u.phone === KEEP_CUSTOMER_PHONE);

console.log('KEEPING:');
for (const u of toKeep) console.log(`  ✓ [${u.role}] +${u.phone}  ${u.store_name}`);
console.log('\nDELETING:');
for (const u of toDelete) console.log(`  ✗ [${u.role}] +${u.phone}  ${u.store_name}`);

if (!confirmed) {
  console.log('\nDry run. To actually delete + reset, re-run with --confirm');
  process.exit(0);
}

// 2. Delete users (public.users first — the FK cascade also cleans order_items / notifications)
for (const u of toDelete) {
  // Delete public.users row
  const { error: pubErr } = await sb.from('users').delete().eq('id', u.id);
  if (pubErr) console.log(`  ⚠ public.users delete for ${u.phone}: ${pubErr.message}`);
  // Delete auth.users row
  const { error: authErr } = await sb.auth.admin.deleteUser(u.id);
  if (authErr) console.log(`  ⚠ auth delete for ${u.phone}: ${authErr.message}`);
  else console.log(`  ✗ deleted ${u.phone}`);
}

// 3. Reset the pilot customer (rename → Pharma, upgrade credit, reset password)
const customer = toKeep.find(u => u.phone === KEEP_CUSTOMER_PHONE);
if (customer) {
  const newPassword = crypto.randomBytes(9).toString('base64url');
  const newEmail = `client-${KEEP_CUSTOMER_PHONE}@upkem.internal`;

  // Reset password + confirm email
  const { error: authErr } = await sb.auth.admin.updateUserById(customer.id, {
    email: newEmail,
    password: newPassword,
    email_confirm: true,
    phone_confirm: true,
  });
  if (authErr) console.log(`  ⚠ password reset failed: ${authErr.message}`);

  // Update public.users profile
  const { error: pubErr } = await sb.from('users').update({
    store_name: NEW_CUSTOMER_STORE,
    role: 'client',
    is_approved: true,
    is_blocked: false,
    credit_balance: 0,
    credit_limit: NEW_CUSTOMER_CREDIT_LIMIT,
    email: newEmail,
  }).eq('id', customer.id);
  if (pubErr) console.log(`  ⚠ profile update failed: ${pubErr.message}`);

  console.log(`\n✅ Pilot customer ready:`);
  console.log(`   Store:    ${NEW_CUSTOMER_STORE}`);
  console.log(`   Phone:    ${KEEP_CUSTOMER_PHONE.slice(-10)}`);
  console.log(`   Password: ${newPassword}`);
  console.log(`   Credit:   ₹0 balance / ₹${NEW_CUSTOMER_CREDIT_LIMIT.toLocaleString('en-IN')} limit\n`);
}

// 4. Also blow away any lingering orders / invoices / notifications so the
// pilot starts truly clean.
const { count: orderCount } = await sb.from('orders').select('*', { head: true, count: 'exact' });
if (orderCount && orderCount > 0) {
  await sb.from('order_items').delete().gte('id', 0);
  await sb.from('invoices').delete().gte('id', 0);
  await sb.from('orders').delete().gte('id', 0);
  console.log(`  ✗ wiped ${orderCount} order(s) + items + invoices`);
}
const { count: notifCount } = await sb.from('notifications').select('*', { head: true, count: 'exact' });
if (notifCount && notifCount > 0) {
  await sb.from('notifications').delete().gte('id', 0);
  console.log(`  ✗ wiped ${notifCount} notification(s)`);
}

console.log('\n✅ DB reset to pilot state.');
