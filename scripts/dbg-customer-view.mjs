import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The new customer from the report — Dhruv agenc7 (6349349348)
const { data: newCust } = await sb.from('users').select('*').eq('phone', '916349349348').maybeSingle();
console.log('New customer profile:');
console.log('  id:', newCust?.id);
console.log('  phone:', newCust?.phone);
console.log('  store_name:', newCust?.store_name);
console.log('  role:', newCust?.role);
console.log('  is_admin:', newCust?.is_admin);
console.log('  email_verified:', newCust?.email_verified);

// What notifications does the customer branch return for them?
const { data: notifs } = await sb.from('notifications')
  .select('id, user_id, for_admin, type, title, body, created_at')
  .eq('user_id', newCust.id)
  .order('created_at', { ascending: false })
  .limit(20);
console.log(`\nNotifications belonging to this customer (${notifs?.length || 0}):`);
for (const n of notifs || []) {
  console.log(`  [${n.type}] user_id=${n.user_id?.slice(0,8)} for_admin=${n.for_admin} · ${n.title}`);
}

// Any notifications INCORRECTLY targeted at this customer?
const { data: adminNotifs } = await sb.from('notifications')
  .select('id, user_id, for_admin, type, title')
  .eq('for_admin', true)
  .limit(5);
console.log(`\nAdmin-broadcast notifications (should have user_id NULL):`);
for (const n of adminNotifs || []) {
  console.log(`  [${n.type}] user_id=${n.user_id?.slice(0,8) || 'NULL'} for_admin=${n.for_admin} · ${n.title}`);
}
