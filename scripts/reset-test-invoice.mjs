// Reset the test invoice back to Draft so we can see the admin Review flow.
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

await sb.from('invoices').update({
  status: 'Draft', approved_at: null, approved_by: null,
}).eq('invoice_no', 'UPD0145');

await sb.from('orders').update({ status: 'Invoicing' }).eq('id', 'UPK-7482');

// Clear the batch/expiry so admin has to re-enter
await sb.from('order_items').update({
  batch_no: null, expiry_date: null,
}).eq('order_id', 'UPK-7482');

console.log('✅ Reset UPD0145 → Draft, order UPK-7482 → Invoicing, cleared batch/expiry');
console.log('   Open http://localhost:3000/admin → Orders tab → find UPK-7482 → click "Review Invoice"');
