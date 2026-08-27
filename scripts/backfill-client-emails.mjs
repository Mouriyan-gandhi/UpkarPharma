// Give every client (non-admin) user a synthetic email so they can log in via
// web without phone provider enabled. Mirrors backfill-admin-emails.
//
// Behavior:
//   - Email is always set/updated.
//   - Password is ONLY (re)set if you pass --reset-passwords, in which case
//     each client gets a fresh random password printed to stdout.
//
// Usage:
//   node scripts/backfill-client-emails.mjs
//   node scripts/backfill-client-emails.mjs --reset-passwords

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

const resetPasswords = process.argv.includes('--reset-passwords');

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const { data: clients, error } = await sb
  .from('users').select('id, phone, store_name').eq('role', 'client');
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${clients.length} client(s). Backfilling${resetPasswords ? ' + resetting passwords' : ''}…\n`);
for (const c of clients) {
  const email = `client-${c.phone}@upkem.internal`;
  const update = { email, email_confirm: true };
  let tempPassword = null;
  if (resetPasswords) {
    tempPassword = crypto.randomBytes(9).toString('base64url');
    update.password = tempPassword;
  }
  const { error: uErr } = await sb.auth.admin.updateUserById(c.id, update);
  if (uErr) console.log(`  ❌ ${c.phone} (${c.store_name}): ${uErr.message}`);
  else if (tempPassword) console.log(`  ✅ ${c.phone} (${c.store_name}) → ${email} / ${tempPassword}`);
  else console.log(`  ✅ ${c.phone} (${c.store_name}) → ${email} (password unchanged)`);
}

if (resetPasswords) {
  console.log('\n⚠️  Save the printed passwords now — they are not stored.');
}
