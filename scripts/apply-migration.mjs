// Applies a raw SQL migration file to the current Supabase project by
// splitting on top-level semicolons and executing each statement via a
// service_role connection to the public REST endpoint that maps to
// PostgREST's rpc('exec_sql'). Since exec_sql isn't a default function we
// instead use the pg meta HTTP endpoint via node-postgres over the
// pooler URL if available; otherwise fall back to exec via a POST to
// /rest/v1/rpc/exec_sql that the caller has pre-created.
//
// SIMPLER approach used here: connect directly with the pg client using the
// SUPABASE_DB_URL env var (Direct Connection string from Dashboard →
// Project Settings → Database → Connection string, Session mode).
//
// Usage:
//   SUPABASE_DB_URL=postgresql://... node scripts/apply-migration.mjs supabase/migrations/0004_credit_requests.sql

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('❌ Missing SUPABASE_DB_URL.');
  console.error('   Get it from Supabase Dashboard → Project Settings → Database → Connection string (Session mode, "URI").');
  console.error('   Then add it to .env.local as SUPABASE_DB_URL=postgresql://...');
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-.sql>');
  process.exit(1);
}
const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log(`→ Applying ${path.basename(file)} …`);
try {
  await client.query(sql);
  console.log('✅ Migration applied cleanly.');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
