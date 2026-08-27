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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

// Sample prices
const { data } = await sb
  .from('products')
  .select('id, name, price, price_ptr, mrp, sal_rate, pts, pur_rate')
  .order('id', { ascending: true })
  .limit(8);
console.table(data);

// How many have non-zero prices?
const { count: totalRows } = await sb.from('products').select('*', { head: true, count: 'exact' });
const { count: withPrice } = await sb.from('products').select('*', { head: true, count: 'exact' }).gt('price', 0);
const { count: withPtr } = await sb.from('products').select('*', { head: true, count: 'exact' }).gt('price_ptr', 0);
const { count: withMrp } = await sb.from('products').select('*', { head: true, count: 'exact' }).gt('mrp', 0);
const { count: withSal } = await sb.from('products').select('*', { head: true, count: 'exact' }).gt('sal_rate', 0);
console.log('\nRow counts:');
console.log('  total:      ', totalRows);
console.log('  price > 0:  ', withPrice);
console.log('  price_ptr > 0:', withPtr);
console.log('  mrp > 0:    ', withMrp);
console.log('  sal_rate > 0:', withSal);
