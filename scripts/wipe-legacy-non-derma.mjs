// One-shot: delete all non-Derma products (the ~5,903 legacy SQLite-era
// SKUs) so the catalog is a clean Derma-only pilot.
//
// Safety: also removes any order_items pointing at those products (via
// FK CASCADE, expected to be zero since customers only bought Derma).
// Refuses to run if there are non-Derma orders — those need review first.
//
// Run: node scripts/wipe-legacy-non-derma.mjs
// Add --confirm to actually delete (default is a dry run).

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

const confirmed = process.argv.includes('--confirm');

// 1. Count what's about to disappear
const { count: nonDermaCount } = await sb.from('products')
  .select('*', { head: true, count: 'exact' })
  .not('category', 'eq', 'Derma');

const { count: dermaCount } = await sb.from('products')
  .select('*', { head: true, count: 'exact' })
  .eq('category', 'Derma');

console.log(`Non-Derma products to delete: ${nonDermaCount}`);
console.log(`Derma products (kept):        ${dermaCount}`);

// 2. Check if any orders reference non-Derma products (safety net)
const { data: nonDermaProducts } = await sb.from('products')
  .select('id')
  .not('category', 'eq', 'Derma');
const ids = (nonDermaProducts || []).map(p => p.id);

const { count: linkedOrderItems } = await sb.from('order_items')
  .select('*', { head: true, count: 'exact' })
  .in('product_id', ids);

if (linkedOrderItems && linkedOrderItems > 0) {
  console.log(`\n⚠️  ${linkedOrderItems} existing order_items reference non-Derma products.`);
  console.log('   Deletion would break those historical orders. Aborting to protect them.');
  console.log('   Review + manually clean those orders first, then re-run.');
  process.exit(1);
}

if (!confirmed) {
  console.log(`\nDry run — no changes made. To actually delete, re-run with --confirm:`);
  console.log('   node scripts/wipe-legacy-non-derma.mjs --confirm');
  process.exit(0);
}

// 3. Batch delete (Supabase caps `.in()` list length; delete in chunks of 500)
let deleted = 0;
for (let i = 0; i < ids.length; i += 500) {
  const batch = ids.slice(i, i + 500);
  const { error } = await sb.from('products').delete().in('id', batch);
  if (error) { console.error(`Batch ${i}-${i + batch.length} failed:`, error); process.exit(1); }
  deleted += batch.length;
  process.stdout.write(`\r Deleted ${deleted} / ${ids.length}`);
}
console.log(`\n✅ Removed ${deleted} legacy non-Derma products.`);
console.log(`   Catalog is now Derma-only (${dermaCount} SKUs).`);
