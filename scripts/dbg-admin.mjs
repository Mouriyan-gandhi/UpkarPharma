import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const admins = users.users.filter(u => u.phone === '916379019139' || (u.email || '').includes('6379019139') || (u.user_metadata?.store_name || '').toLowerCase().includes('dhruv gandhi'));
for (const a of admins) {
  console.log(`id=${a.id}  email=${a.email}  phone=${a.phone}  provider=${(a.identities||[]).map(i=>i.provider).join(',')}`);
}
