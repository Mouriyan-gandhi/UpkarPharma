import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from('products').select('body_system').eq('category', 'Derma');
const counts = {};
for (const { body_system } of data || []) counts[body_system] = (counts[body_system] || 0) + 1;
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`${v}\t${k}`);
