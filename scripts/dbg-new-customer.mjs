import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Report state of every non-admin customer — verifies verify-email path
const { data: users } = await sb.from('users').select('*').eq('role', 'client');
for (const u of users || []) {
  const { data: authRes } = await sb.auth.admin.getUserById(u.id);
  console.log(`\n${u.store_name} (+${u.phone})`);
  console.log(`  auth.email:              ${authRes.user?.email}`);
  console.log(`  auth.email_confirmed_at: ${authRes.user?.email_confirmed_at || 'NULL'}`);
  console.log(`  public.email_verified:   ${u.email_verified}`);
  console.log(`  public.is_approved:      ${u.is_approved}`);
  console.log(`  identities:              ${(authRes.user?.identities || []).map((i) => i.provider).join(', ')}`);
}
