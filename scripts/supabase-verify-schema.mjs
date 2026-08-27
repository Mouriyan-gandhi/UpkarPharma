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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const expected = [
  'users', 'products', 'orders', 'order_items',
  'invoices', 'invoice_counter', 'schemes',
  'notifications', 'profile_change_requests',
];

console.log('Checking tables in the public schema...\n');
let ok = 0, missing = 0;
for (const t of expected) {
  const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`  ❌ ${t.padEnd(28)} MISSING or inaccessible — ${error.message}`);
    missing++;
  } else {
    console.log(`  ✅ ${t.padEnd(28)} ${count ?? 0} rows`);
    ok++;
  }
}

console.log(`\n${ok}/${expected.length} tables present`);
if (missing > 0) process.exit(1);
console.log('Schema verification passed.');
