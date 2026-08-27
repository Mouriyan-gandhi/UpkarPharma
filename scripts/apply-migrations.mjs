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

const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Applying ${files.length} migration(s) from ${migrationsDir}\n`);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const file of files) {
  const p = path.join(migrationsDir, file);
  const sql = fs.readFileSync(p, 'utf8');
  process.stdout.write(`→ ${file} ... `);
  try {
    await client.query(sql);
    console.log('OK');
  } catch (e) {
    console.log('FAIL');
    console.error(`\n${e.message}\n`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('\n✅ All migrations applied.');
