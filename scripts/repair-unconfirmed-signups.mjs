// One-shot repair: any customer who signed up during the window when signup
// used publicClient.signUp() will have auth.users.email_confirmed_at = NULL
// and be unable to sign in (because "Confirm email" is enabled in Dashboard).
//
// This script marks every non-admin auth user as email-confirmed at the
// Supabase level so their password logins go through. It does NOT touch
// public.users.email_verified — that's our separate trust badge that
// only flips when the customer clicks OUR verify link.
//
// Idempotent — running twice is safe.
//
// Run: node scripts/repair-unconfirmed-signups.mjs

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

const { data: authUsers } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (!authUsers) { console.error('Could not list users'); process.exit(1); }

let fixed = 0;
let alreadyOk = 0;
for (const u of authUsers.users) {
  if (u.email_confirmed_at) { alreadyOk++; continue; }
  const { error } = await sb.auth.admin.updateUserById(u.id, {
    email_confirm: true,
  });
  if (error) {
    console.log(`  ⚠ ${u.email || u.phone}: ${error.message}`);
    continue;
  }
  console.log(`  ✓ ${u.email || u.phone}`);
  fixed++;
}

console.log(`\nDone. ${fixed} confirmed, ${alreadyOk} already OK.`);
