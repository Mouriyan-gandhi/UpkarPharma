import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('/Users/apple/upkem_verify/apk_upkem/.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log('URL:', env.NEXT_PUBLIC_SUPABASE_URL);
const { data, error, count } = await sb.from('users').select('*', { count: 'exact' });
console.log('users:', count, 'error:', error);
console.log(data?.slice(0, 2));
