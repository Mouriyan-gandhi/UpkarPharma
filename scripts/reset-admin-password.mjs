// One-off: reset Dhruv's admin password to a known value so we can hand it
// over cleanly. Prints the new password once — save it to your password manager.

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

const ADMIN_PHONE_DIGITS = '916379019139';
const email = `admin-${ADMIN_PHONE_DIGITS}@upkem.internal`;
const newPassword = crypto.randomBytes(9).toString('base64url');

// Look up the auth user
const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const admin = users?.users.find(u => u.email === email || u.phone === ADMIN_PHONE_DIGITS);
if (!admin) { console.error('❌ Dhruv admin account not found'); process.exit(1); }

const { error } = await sb.auth.admin.updateUserById(admin.id, {
  email,
  password: newPassword,
  email_confirm: true,
  phone_confirm: true,
});
if (error) { console.error('❌ Password reset failed:', error.message); process.exit(1); }

console.log(`\n✅ Admin password reset.`);
console.log(`   Phone:    6379019139`);
console.log(`   Password: ${newPassword}\n`);
