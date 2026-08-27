import pg from 'pg';
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

const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error('Missing SUPABASE_DB_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const r = await client.query('SELECT current_database() AS db, version() AS ver');
  console.log('✅ Direct psql connection OK');
  console.log('   Database:', r.rows[0].db);
  console.log('   Postgres:', r.rows[0].ver.split(',')[0]);
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
} finally {
  await client.end();
}
