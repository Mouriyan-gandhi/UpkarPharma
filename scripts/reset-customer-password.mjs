// Reset a specific customer's password to a known value. Pass the phone
// (10 digits, no country code) as the first arg. Prints the new password
// once — save it to your password manager.
//
//   node scripts/reset-customer-password.mjs 9999999999

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const raw = process.argv[2] || '9999999999';
const digits = String(raw).replace(/\D/g, '');
const tenDigit = digits.slice(-10);
const twelveDigit = '91' + tenDigit;

const { data: profile } = await sb.from('users').select('id, store_name, phone, role, email').eq('phone', twelveDigit).maybeSingle();
if (!profile) {
  console.error(`❌ No customer found with phone +${twelveDigit}`);
  process.exit(1);
}
if (profile.role !== 'client') {
  console.error(`⚠  ${profile.store_name} is a ${profile.role}, not a client — refusing. Use reset-admin-password.mjs for admins.`);
  process.exit(1);
}

const newPassword = crypto.randomBytes(9).toString('base64url');
const { error } = await sb.auth.admin.updateUserById(profile.id, {
  password: newPassword,
  email_confirm: true,
  phone_confirm: true,
});
if (error) { console.error('❌ Password reset failed:', error.message); process.exit(1); }

console.log(`\n✅ Customer password reset.`);
console.log(`   Store:    ${profile.store_name}`);
console.log(`   Phone:    ${tenDigit}`);
console.log(`   Email:    ${profile.email || '(none)'}`);
console.log(`   Password: ${newPassword}\n`);
