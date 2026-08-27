// Seed the first admin user against the current Supabase project.
//
//   node scripts/seed-first-admin.mjs <phone> [store_name] [password]
//
// If password is omitted, a strong random password is generated and PRINTED
// ONCE at the end — save it to your password manager, it can't be recovered.
//
// Because the Supabase phone provider isn't enabled yet, the auth user is
// created with a synthetic email (`admin-<phoneDigits>@upkem.internal`) that
// mirrors the fallback pattern used by /api/auth/route.ts. Once phone auth
// is enabled you can switch admin login to phone+password without touching
// this account — the auth user will already have phone_confirm=true.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env.local');

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svc) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const [, , rawPhone, storeName = 'UPKAR Admin', providedPassword] = process.argv;
if (!rawPhone) {
  console.error('Usage: node scripts/seed-first-admin.mjs <phone> [store_name] [password]');
  console.error('  phone: 10-digit Indian number, e.g. 9876543210 (91 prefix added automatically)');
  process.exit(1);
}

function toE164(p) {
  const d = String(p).replace(/\D/g, '');
  if (d.startsWith('91') && d.length === 12) return '+' + d;
  if (d.length === 10) return '+91' + d;
  return p.startsWith('+') ? p : '+' + d;
}

const phoneE164 = toE164(rawPhone);
const phoneDigits = phoneE164.replace(/^\+/, '');
const email = `admin-${phoneDigits}@upkem.internal`;
const password = providedPassword || crypto.randomBytes(12).toString('base64url');

const sb = createClient(url, svc, { auth: { persistSession: false } });

console.log(`\nSeeding admin:`);
console.log(`  phone:       ${phoneE164}`);
console.log(`  email:       ${email}`);
console.log(`  store_name:  ${storeName}\n`);

// Check for existing auth user by phone
const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const match = existing?.users.find(u => u.phone === phoneDigits || u.email === email);

let userId;
if (match) {
  console.log(`↺ auth user already exists (${match.id}) — updating password + email...`);
  const { error } = await sb.auth.admin.updateUserById(match.id, {
    email,
    password,
    email_confirm: true,
    phone_confirm: true,
  });
  if (error) { console.error('❌ updateUser failed:', error.message); process.exit(1); }
  userId = match.id;
} else {
  console.log(`+ creating auth user...`);
  const { data, error } = await sb.auth.admin.createUser({
    phone: phoneE164,
    email,
    password,
    phone_confirm: true,
    email_confirm: true,
    user_metadata: { store_name: storeName },
  });
  if (error || !data.user) { console.error('❌ createUser failed:', error?.message); process.exit(1); }
  userId = data.user.id;
}

// Upsert public.users row with admin role + approved
const { error: upErr } = await sb.from('users').upsert({
  id: userId,
  phone: phoneDigits,
  store_name: storeName,
  role: 'admin',
  is_approved: true,
  is_blocked: false,
  email,
  user_type: 'Admin',
}, { onConflict: 'id' });
if (upErr) { console.error('❌ upsert public.users failed:', upErr.message); process.exit(1); }

console.log(`\n✅ Admin ready.`);
console.log(`   Login at: http://localhost:3000/login`);
console.log(`   Phone:    ${rawPhone.replace(/\D/g, '').slice(-10)}`);
console.log(`   Password: ${password}`);
console.log(`\n⚠️  Save the password NOW — this is the only time it's shown.\n`);
