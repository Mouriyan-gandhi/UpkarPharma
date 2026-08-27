// Give every client (non-admin) user a synthetic email + password so they can
// log in via web without phone provider enabled. Mirrors backfill-admin-emails.
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

const { data: clients, error } = await sb
  .from('users').select('id, phone, store_name').eq('role', 'client');
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${clients.length} client(s). Backfilling…\n`);
for (const c of clients) {
  const email = `client-${c.phone}@upkem.internal`;
  const { error: uErr } = await sb.auth.admin.updateUserById(c.id, {
    email,
    password: '123456',
    email_confirm: true,
  });
  if (uErr) console.log(`  ❌ ${c.phone} (${c.store_name}): ${uErr.message}`);
  else console.log(`  ✅ ${c.phone} (${c.store_name}) → ${email} / 123456`);
}

console.log('\nCustomer login (until phone provider is enabled):');
console.log('  URL:      http://localhost:3000/customer-login');
console.log('  Phone:    (any client phone, e.g. 9999999999 for City Pharma)');
console.log('  Password: 123456');
