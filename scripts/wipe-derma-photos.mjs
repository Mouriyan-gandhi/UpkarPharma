// One-shot: clear image_url + images[] on all Derma products AND delete the
// vakul-derma/ folder from the product-images Supabase Storage bucket.
//
// Rationale: the brochure-extracted photos were inconsistent (mix of
// product boxes, models, and page snippets). Admin will re-upload real
// product photos per SKU from the mobile admin screen.
//
// Safe to re-run: does nothing if there's no image_url and the folder is
// already empty.
//
// Run: node scripts/wipe-derma-photos.mjs

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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// 1. Clear DB references
const { error: uErr } = await sb.from('products')
  .update({ image_url: null, images: [] })
  .eq('category', 'Derma');
if (uErr) { console.error('DB update error:', uErr); process.exit(1); }
console.log('✅ Cleared image_url + images[] on all Derma products');

// 2. List and delete every file under vakul-derma/
const bucket = 'product-images';
const folder = 'vakul-derma';
let totalDeleted = 0;
let cursor = 0;
while (true) {
  const { data: files, error: lErr } = await sb.storage
    .from(bucket)
    .list(folder, { limit: 1000, offset: cursor });
  if (lErr) { console.error('List error:', lErr); break; }
  if (!files || files.length === 0) break;
  const paths = files.map(f => `${folder}/${f.name}`);
  const { error: dErr } = await sb.storage.from(bucket).remove(paths);
  if (dErr) { console.error('Delete error:', dErr); break; }
  totalDeleted += files.length;
  if (files.length < 1000) break;
  cursor += 1000;
}
console.log(`✅ Deleted ${totalDeleted} file(s) from ${bucket}/${folder}/`);
