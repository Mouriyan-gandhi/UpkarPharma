// One-shot snapshot of who's in the DB right now — used before a wipe so
// we can eyeball what's about to disappear.
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: users } = await sb.from('users').select('id, phone, store_name, role, is_approved, is_blocked, credit_balance, credit_limit').order('role, phone');
const { count: prodCount } = await sb.from('products').select('*', { head: true, count: 'exact' });
const { count: orderCount } = await sb.from('orders').select('*', { head: true, count: 'exact' });
const { count: invCount } = await sb.from('invoices').select('*', { head: true, count: 'exact' }).then(r => r.error ? { count: 'N/A' } : r);
const { count: crCount } = await sb.from('credit_requests').select('*', { head: true, count: 'exact' }).then(r => r.error ? { count: 'N/A' } : r);

console.log('\n─── USERS ────────────────────────────────────────');
for (const u of users || []) {
  console.log(`  [${u.role}] +${u.phone}  ${u.store_name || '—'}  approved=${u.is_approved} blocked=${u.is_blocked}  credit=${u.credit_balance}/${u.credit_limit}  (${u.id})`);
}
console.log(`\n─── COUNTS ───────────────────────────────────────`);
console.log(`  products:        ${prodCount}`);
console.log(`  orders:          ${orderCount}`);
console.log(`  invoices:        ${invCount}`);
console.log(`  credit_requests: ${crCount}`);
