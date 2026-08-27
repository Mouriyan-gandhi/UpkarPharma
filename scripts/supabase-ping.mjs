import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env.local');

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !svc) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const client = createClient(url, svc, { auth: { persistSession: false } });

// A tiny query on a nonexistent table proves the URL + key handshake works.
// We expect a "table not found" style error, NOT a 401/network error.
const { error } = await client.from('__ping__').select('*').limit(1);

if (error) {
  if (/not.?exist|not.?found|Could not find/i.test(error.message)) {
    console.log('✅ Supabase connection verified');
    console.log('   URL:', url);
    console.log('   Service role: authenticated');
    console.log('   Ready to push schema.');
    process.exit(0);
  }
  console.error('❌ Connection failed:', error);
  process.exit(1);
}

console.log('✅ Supabase connection verified (no error)');
console.log('   URL:', url);
