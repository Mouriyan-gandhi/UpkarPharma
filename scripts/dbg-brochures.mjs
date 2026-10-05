import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local', 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from('brochures').select('id, title, company, category, file_size, is_active').order('id', { ascending: true });
for (const b of data || []) {
  console.log(`  #${b.id} ${b.title} · ${b.company} · ${(b.file_size / 1024 / 1024).toFixed(1)} MB · active=${b.is_active}`);
}
