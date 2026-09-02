// One-shot: for every Derma product, promote the first candidate
// isolated-shot in `images[]` to be the primary `image_url`. Runs against
// live Supabase.
//
// Why: the initial import used the rendered brochure page as the primary
// image. When squeezed into 193x193 grid cards those look empty (cropping
// to the page header). The candidate shots (extracted embedded images) are
// portrait/square product packages and read much better in the grid.
//
// Idempotent: skips rows whose image_url already matches images[1].
//
// Run: node scripts/swap-derma-primary-photo.mjs

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

const { data, error } = await sb
  .from('products')
  .select('id, name, images, image_url')
  .eq('category', 'Derma');
if (error) { console.error(error); process.exit(1); }

let swapped = 0, kept = 0;
for (const p of data) {
  const imgs = p.images || [];
  if (imgs.length < 2) { kept++; continue; }
  const newPrimary = imgs[1];
  if (p.image_url === newPrimary) continue;
  const { error: uErr } = await sb.from('products').update({ image_url: newPrimary }).eq('id', p.id);
  if (uErr) { console.error(`  ✗ ${p.name}:`, uErr.message); continue; }
  swapped++;
}

console.log(`✅ Swapped ${swapped} primary photos to isolated shots`);
console.log(`   (${kept} products had no alternates to swap to)`);
