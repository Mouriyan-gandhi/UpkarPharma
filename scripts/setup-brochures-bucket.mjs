// One-shot: create the 'brochures' storage bucket (public read) and seed
// the Vakul Lifescience PDF as the first brochure so the customer app has
// something to show on first launch.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. Create bucket (idempotent — ignores "already exists"). Supabase free
// tier caps individual files at 50 MB, so we ship compressed brochures
// (ghostscript /ebook profile) rather than raw scans.
const { error: bucketErr } = await sb.storage.createBucket('brochures', {
  public: true,
  allowedMimeTypes: ['application/pdf'],
  fileSizeLimit: 50 * 1024 * 1024,
});
if (bucketErr && !/already exists|duplicate/i.test(bucketErr.message)) {
  console.error('❌ bucket create failed:', bucketErr.message);
  process.exit(1);
}
console.log(bucketErr ? '↺ bucket already exists' : '+ created bucket "brochures" (public)');

// 2. Seed the Vakul brochure (compressed via ghostscript to fit under 50 MB)
const VAKUL_PATH = '/tmp/vakul-compressed.pdf';
if (!fs.existsSync(VAKUL_PATH)) {
  console.log(`⚠ ${VAKUL_PATH} not found — compress the original first:`);
  console.log('   gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH \\');
  console.log('      -sOutputFile=/tmp/vakul-compressed.pdf \\');
  console.log('      "/Users/apple/upkem_verify/VAKUL LIFESCIENCE BROUCHURE-2026.pdf"');
  process.exit(0);
}

const buf = fs.readFileSync(VAKUL_PATH);
const key = `derma/vakul-lifescience-2026.pdf`;

const { error: upErr } = await sb.storage.from('brochures').upload(key, buf, {
  contentType: 'application/pdf',
  upsert: true,
});
if (upErr) { console.error('❌ upload failed:', upErr.message); process.exit(1); }

const { data: pub } = sb.storage.from('brochures').getPublicUrl(key);

// 3. Insert / update the DB row
const { data: existing } = await sb.from('brochures')
  .select('id').eq('storage_key', key).maybeSingle();

const row = {
  title: 'Vakul Lifescience Derma Catalog 2026',
  subtitle: 'Full range with pack, MRP and PTR',
  company: 'Vakul Lifescience',
  category: 'Derma',
  storage_key: key,
  file_url: pub.publicUrl,
  file_size: buf.length,
  is_active: true,
};

if (existing) {
  await sb.from('brochures').update(row).eq('id', existing.id);
  console.log(`↺ updated brochure #${existing.id}`);
} else {
  const { data, error } = await sb.from('brochures').insert(row).select('id').single();
  if (error) { console.error('❌ insert failed:', error.message); process.exit(1); }
  console.log(`+ inserted brochure #${data.id}`);
}

console.log(`\n✅ Ready. Public URL:\n  ${pub.publicUrl}`);
