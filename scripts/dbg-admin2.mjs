import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Find Dhruv Gandhi from public.users first
const { data: profile } = await sb.from('users').select('*').eq('store_name', 'Dhruv Gandhi').maybeSingle();
console.log('Profile:', profile);
if (profile) {
  const { data: auth } = await sb.auth.admin.getUserById(profile.id);
  console.log('Auth:', { id: auth.user?.id, email: auth.user?.email, phone: auth.user?.phone });
}
