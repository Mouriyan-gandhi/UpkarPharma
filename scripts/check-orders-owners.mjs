import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: orders } = await sb.from('orders').select('id, user_id, phone, store_name, date, total, status').order('created_at', { ascending: false });
console.log('Orders:', orders?.length);
for (const o of orders || []) {
  const { data: owner } = await sb.from('users').select('phone,store_name').eq('id', o.user_id).maybeSingle();
  console.log(`  ${o.id} · owner_id=${o.user_id?.slice(0,8) || 'NULL'} · profile=${owner?.phone||'?'}/${owner?.store_name||'?'} · order.phone=${o.phone} order.store=${o.store_name}`);
}
