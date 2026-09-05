import { NextResponse } from 'next/server';
import { getAnyAdmin, getMobileUser, getWebUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'node:crypto';

// GET /api/brochures — list active brochures (any authenticated user).
export async function GET(request: Request) {
  const admin = await getAnyAdmin(request);
  const user = admin || (await getMobileUser(request)) || (await getWebUser());
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  let q = sb.from('brochures')
    .select('id, title, subtitle, company, category, storage_key, file_url, cover_url, file_size, page_count, uploaded_at, is_active')
    .order('uploaded_at', { ascending: false });
  if (!admin) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brochures: data || [] });
}

// POST /api/brochures — admin uploads a new brochure PDF.
// Multipart form-data:
//   file        — the PDF
//   title       — required
//   subtitle    — optional
//   company     — optional
//   category    — optional (defaults 'Derma')
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required (multipart)' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `PDF too large. Max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  const title = (form?.get('title') as string || '').trim();
  const subtitle = (form?.get('subtitle') as string || '').trim() || null;
  const company = (form?.get('company') as string || '').trim() || null;
  const category = (form?.get('category') as string || 'Derma').trim();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const sb = supabaseAdmin();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const key = `${category.toLowerCase()}/${slug || 'brochure'}-${crypto.randomUUID().slice(0, 8)}.pdf`;

  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from('brochures').upload(key, new Uint8Array(buf), {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = sb.storage.from('brochures').getPublicUrl(key);
  const { data, error } = await sb.from('brochures').insert({
    title,
    subtitle,
    company,
    category,
    storage_key: key,
    file_url: pub.publicUrl,
    file_size: file.size,
    uploaded_by: admin.id,
    is_active: true,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ brochure: data });
}

// PATCH /api/brochures — admin toggles active / edits metadata.
//   { id, is_active?, title?, subtitle?, company?, category? }
export async function PATCH(request: Request) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: any = {};
  for (const k of ['title', 'subtitle', 'company', 'category', 'is_active']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { error } = await supabaseAdmin().from('brochures').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/brochures?id=… — admin removes a brochure (also purges storage).
export async function DELETE(request: Request) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: existing } = await sb.from('brochures').select('storage_key').eq('id', id).maybeSingle();
  if (existing?.storage_key) {
    await sb.storage.from('brochures').remove([existing.storage_key]).catch(() => {});
  }
  await sb.from('brochures').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
