import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

// POST /api/admin/product-image
//
// Admin uploads a product photo (from mobile camera / gallery) as multipart
// form-data. We stream it to the Supabase Storage bucket `product-images`
// under `admin-uploads/<uuid>.<ext>` and return the public URL. The caller
// (mobile AdminProductEditScreen) then patches the product's image_url.
//
// Auth: admin cookie session (web) OR mobile bearer token (native app).
// Rate-limited to prevent runaway uploads on a bad admin device.
// Size cap: 10 MB per image (matches /api/upload cap). Photos taken on
// modern phones are 3-5 MB — plenty of headroom.

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export async function POST(request: Request) {
  const gate = checkRateLimit(request, 'product-image-upload', { max: 60, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'Too many uploads. Slow down for a minute.' },
      { status: 429 },
    );
  }

  // Accept either an authenticated admin (cookie-based web session) or a
  // bearer-token mobile user whose role check we run manually.
  const admin = await getAdmin();
  let isAdmin = !!admin;
  if (!isAdmin) {
    const mobile = await getMobileUser(request);
    isAdmin = !!mobile && (mobile as { role?: string }).role === 'admin';
  }
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required (multipart)' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large. Max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }
  const mime = (file.type || '').toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported image type "${mime}". Use JPEG / PNG / WebP / HEIC.` },
      { status: 415 },
    );
  }

  // Derive a safe extension from MIME (fallback jpg — most camera photos).
  const ext =
    mime === 'image/png' ? 'png'
    : mime === 'image/webp' ? 'webp'
    : mime === 'image/heic' || mime === 'image/heif' ? 'heic'
    : 'jpg';

  const key = `admin-uploads/${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

  const sb = supabaseAdmin();
  const arrayBuffer = await file.arrayBuffer();

  const { error: upErr } = await sb.storage
    .from('product-images')
    .upload(key, new Uint8Array(arrayBuffer), {
      contentType: mime || 'image/jpeg',
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from('product-images').getPublicUrl(key);
  return NextResponse.json({ url: pub.publicUrl, path: key });
}
