// Bulk-upload every compressed PDF in /tmp/catalogs-compressed to the
// brochures bucket + brochures table. Each entry carries a hand-mapped
// clean title + company + category so the customer app shows readable
// labels instead of raw filenames.
//
// Idempotent — looks up any existing row by storage_key and either skips
// (file size matches) or re-uploads + updates metadata (file changed).
//
// Run: node scripts/bulk-upload-brochures.mjs

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

// Clean metadata mapping. filename → {title, subtitle, company, category, key}.
// `key` is the final storage path — stable across re-runs so idempotency works.
const CATALOGS = [
  {
    file: 'VAKUL LIFESCIENCE BROUCHURE-2026.pdf',
    title: 'Vakul Lifescience Derma Catalog 2026',
    subtitle: 'Full range with pack, MRP and PTR',
    company: 'Vakul Lifescience',
    category: 'Derma',
    key: 'derma/vakul-lifescience-2026.pdf',
  },
  {
    file: 'CB PRODUCT CATALOGUE 3rd EDITION 2026-2027.pdf',
    title: 'Concept Biosciences — Product Catalogue 2026-27',
    subtitle: '3rd Edition · full range',
    company: 'Concept Biosciences',
    category: 'Derma',
    key: 'derma/concept-biosciences-2026-27.pdf',
  },
  {
    file: 'DOC-20260516-WA0022..pdf',
    title: 'Life Infusion — 2026 Range',
    subtitle: 'Infusion & specialty formulations',
    company: 'Life Infusion Pvt Ltd',
    category: 'General',
    key: 'general/life-infusion-2026.pdf',
  },
  {
    file: 'GALPHA ECOGEN CATALOG ( NEW PRICE ) 2025-26.pdf',
    title: 'Galpha Ecogen Catalog 2025-26',
    subtitle: 'New-price edition',
    company: 'Galpha Laboratories',
    category: 'General',
    key: 'general/galpha-ecogen-2025-26.pdf',
  },
  {
    file: 'galpha aureo catalog ( new price ).pdf',
    title: 'Galpha Aureo Catalog',
    subtitle: 'New-price edition',
    company: 'Galpha Laboratories',
    category: 'General',
    key: 'general/galpha-aureo.pdf',
  },
  {
    file: 'Plethikind catlogue 2627.pdf',
    title: 'Plethikind Ethica Catalog 2026-27',
    subtitle: 'Current range',
    company: 'Plethikind Ethica',
    category: 'General',
    key: 'general/plethikind-2026-27.pdf',
  },
];

const SRC_DIR = '/tmp/catalogs-compressed';
let created = 0, updated = 0, skipped = 0;

for (const c of CATALOGS) {
  const localPath = path.join(SRC_DIR, c.file);
  if (!fs.existsSync(localPath)) {
    console.log(`⚠  missing (skipping): ${c.file}`);
    continue;
  }
  const buf = fs.readFileSync(localPath);
  const size = buf.length;

  // Any existing row for this key?
  const { data: existing } = await sb.from('brochures')
    .select('id, file_size').eq('storage_key', c.key).maybeSingle();

  if (existing && existing.file_size === size) {
    console.log(`↺ unchanged: ${c.title} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    skipped++;
    continue;
  }

  // Upload (overwrite if exists)
  const { error: upErr } = await sb.storage.from('brochures').upload(c.key, buf, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) { console.error(`❌ ${c.title}: ${upErr.message}`); continue; }

  const { data: pub } = sb.storage.from('brochures').getPublicUrl(c.key);
  const row = {
    title: c.title,
    subtitle: c.subtitle,
    company: c.company,
    category: c.category,
    storage_key: c.key,
    file_url: pub.publicUrl,
    file_size: size,
    is_active: true,
  };

  if (existing) {
    await sb.from('brochures').update(row).eq('id', existing.id);
    console.log(`↑ updated: ${c.title} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    updated++;
  } else {
    await sb.from('brochures').insert(row);
    console.log(`+ created: ${c.title} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    created++;
  }
}

console.log(`\n✅ ${created} created, ${updated} updated, ${skipped} unchanged.`);
