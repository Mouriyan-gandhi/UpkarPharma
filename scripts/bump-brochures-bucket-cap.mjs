// Bumps the brochures Storage bucket's per-file size cap. Needed for the
// larger manufacturer catalogs (post-compression, DOC-… / Plethikind /
// Galpha Ecogen still sit between 65-85 MB). 150 MB is a generous headroom
// without encouraging uncompressed uploads.
//
// Supabase Storage buckets created via SQL / the JS admin API accept an
// updateBucket({ fileSizeLimit }) call that reconfigures the cap in place.

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

const NEW_CAP = 150 * 1024 * 1024;
const { error } = await sb.storage.updateBucket('brochures', {
  public: true,
  allowedMimeTypes: ['application/pdf'],
  fileSizeLimit: NEW_CAP,
});
if (error) { console.error('❌', error.message); process.exit(1); }
console.log(`✅ brochures bucket cap raised to ${NEW_CAP / 1024 / 1024} MB`);
