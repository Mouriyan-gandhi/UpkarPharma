import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// 1. Sign-in via anon key (browser-like)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

console.log('Attempting signInWithPassword({phone:"+916383945610", password:"123456"})...');
const { data, error } = await anon.auth.signInWithPassword({
  phone: '+916383945610',
  password: '123456',
});
if (error) {
  console.log('❌', error.status, error.message);
} else {
  console.log('✅ session issued for', data.user.phone, 'id:', data.user.id);
}

// 2. Check auth.admin.getUser via service_role
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 20 });
console.log('\nAuth users in project:');
for (const u of list?.users || []) {
  console.log('  ', u.phone || u.email, ' role:', u.role, ' confirmed:', !!u.phone_confirmed_at);
}
