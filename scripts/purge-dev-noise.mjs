// One-shot cleanup: remove the two obvious dev-noise users + all their orders.
//   - 919000000000 "Bypass Admin"
//   - 911111100000 "Unknown Store" (the UNKNOWN_PHONE_SUBSTITUTE from migration)
// Deletes:
//   - order_items (via FK cascade on orders)
//   - orders belonging to these users
//   - public.users rows
//   - auth.users rows
// Preserves everything else. Safe to re-run.

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

const NOISE_PHONES = ['919000000000', '911111100000'];

console.log('Purging dev-noise users:', NOISE_PHONES.join(', '), '\n');

// 1. Fetch the target users
const { data: targets, error: uErr } = await sb
  .from('users')
  .select('id, phone, store_name')
  .in('phone', NOISE_PHONES);
if (uErr) { console.error(uErr); process.exit(1); }

if (targets.length === 0) {
  console.log('No matching users found. Already clean.');
  process.exit(0);
}

const targetIds = targets.map(u => u.id);

// 2. Count what we're about to blow away
const { data: theirOrders } = await sb.from('orders').select('id, total, status').in('user_id', targetIds);
const { count: theirItems } = await sb.from('order_items').select('*', { head: true, count: 'exact' })
  .in('order_id', (theirOrders || []).map(o => o.id));

console.log(`  Users:       ${targets.length}`);
console.log(`  Orders:      ${theirOrders?.length ?? 0}`);
console.log(`  Order items: ${theirItems ?? 0}`);

// 3. Delete in FK-safe order
if (theirOrders && theirOrders.length > 0) {
  const orderIds = theirOrders.map(o => o.id);
  const { error: itemErr } = await sb.from('order_items').delete().in('order_id', orderIds);
  if (itemErr) console.error('  ⚠️  order_items delete:', itemErr.message);

  const { error: ordErr } = await sb.from('orders').delete().in('id', orderIds);
  if (ordErr) { console.error('  ❌ orders delete:', ordErr.message); process.exit(1); }
}

const { error: pErr } = await sb.from('users').delete().in('id', targetIds);
if (pErr) { console.error('  ❌ users delete:', pErr.message); process.exit(1); }

for (const t of targets) {
  const { error } = await sb.auth.admin.deleteUser(t.id);
  if (error) console.log(`  ⚠️  auth.users ${t.phone}: ${error.message}`);
  else console.log(`  ✅ removed auth.users ${t.phone} (${t.store_name})`);
}

console.log('\n✅ Purge complete.\n');
console.log('Remaining users:');
const { data: after } = await sb.from('users').select('phone, store_name, role').order('phone');
for (const u of after || []) console.log(`  ${u.phone.padEnd(15)} ${u.role.padEnd(8)} ${u.store_name}`);
