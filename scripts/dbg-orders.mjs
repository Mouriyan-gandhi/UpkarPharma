import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const res = await sb.from('orders').select('*');
console.log('error:', res.error);
console.log('rows:', res.data?.length);
for (const o of res.data || []) {
  console.log(`  ${o.id} · uid=${(o.user_id||'NULL').slice(0,8)} · phone=${o.phone} · store=${o.store_name} · total=${o.total} · status=${o.status}`);
}
