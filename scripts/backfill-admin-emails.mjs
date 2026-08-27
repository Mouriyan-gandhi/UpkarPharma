// Assign a synthetic email to each admin auth user so they can log in via
// email+password (Supabase's Email provider is on by default and needs no
// external creds). Phone-based sign-in stays broken until the user enables
// the Phone provider in the Supabase dashboard.
//
// Behavior:
//   - Email is always set/updated.
//   - Password is ONLY (re)set if you pass --reset-passwords, in which case
//     each admin gets a fresh random password printed to stdout.
//     Without the flag, existing passwords are left alone.
//
// Usage:
//   node scripts/backfill-admin-emails.mjs
//   node scripts/backfill-admin-emails.mjs --reset-passwords

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const resetPasswords = process.argv.includes('--reset-passwords');

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const { data: admins, error } = await sb
  .from('users')
  .select('id, phone, store_name')
  .eq('role', 'admin');
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${admins.length} admin(s). Backfilling emails${resetPasswords ? ' + resetting passwords' : ''}…\n`);

for (const a of admins) {
  const email = `admin-${a.phone}@upkem.internal`;
  const update = { email, email_confirm: true };
  let tempPassword = null;
  if (resetPasswords) {
    tempPassword = crypto.randomBytes(9).toString('base64url');
    update.password = tempPassword;
  }
  const { error: uErr } = await sb.auth.admin.updateUserById(a.id, update);
  if (uErr) {
    console.log(`  ❌ ${a.phone} (${a.store_name}): ${uErr.message}`);
  } else if (tempPassword) {
    console.log(`  ✅ ${a.phone} (${a.store_name}) → ${email} / ${tempPassword}`);
  } else {
    console.log(`  ✅ ${a.phone} (${a.store_name}) → ${email} (password unchanged)`);
  }
}

if (resetPasswords) {
  console.log('\n⚠️  Save the printed passwords now — they are not stored.');
}
