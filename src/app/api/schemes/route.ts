import { NextResponse } from 'next/server';
import { getAdmin, getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET — full list (admin) or active-only (mobile with ?active=true)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active') === 'true';
  const admin = await getAdmin();
  const mobile = admin ? null : await getMobileUser(request);

  if (activeOnly) {
    if (!admin && !mobile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseAdmin()
      .from('schemes')
      .select('*')
      .eq('is_active', true)
      .lte('start_date', today).gte('end_date', today)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ schemes: data });
  }

  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await supabaseAdmin()
    .from('schemes').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schemes: data });
}

// POST — create a new scheme
export async function POST(request: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  const { title, code, scheme_type, start_date, end_date } = body;
  if (!title || !code || !scheme_type || !start_date || !end_date) {
    return NextResponse.json({ error: 'Title, Code, Type, Start/End dates are required' }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from('schemes').select('id').eq('code', code.toUpperCase()).maybeSingle();
  if (existing) return NextResponse.json({ error: 'A scheme with this code already exists' }, { status: 400 });

  const { error } = await sb.from('schemes').insert({
    title: body.title,
    description: body.description || null,
    code: code.toUpperCase(),
    scheme_type: body.scheme_type,
    discount_percent: body.discount_percent || null,
    flat_discount: body.flat_discount || null,
    min_order_value: body.min_order_value || 0,
    max_discount: body.max_discount || null,
    start_date: body.start_date,
    end_date: body.end_date,
    usage_limit: body.usage_limit || 0,
    per_user_limit: body.per_user_limit !== undefined ? body.per_user_limit : 1,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: 'Scheme created successfully' });
}

// PUT — update or toggle active
export async function PUT(request: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  const { id, action } = body;
  if (!id) return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
  const sb = supabaseAdmin();

  if (action === 'toggle') {
    const { data: s } = await sb.from('schemes').select('is_active').eq('id', id).maybeSingle();
    const { error } = await sb.from('schemes').update({ is_active: !s?.is_active }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const patch: any = {};
  for (const k of ['title','description','scheme_type','discount_percent','flat_discount','min_order_value','max_discount','start_date','end_date','usage_limit','per_user_limit']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.code) patch.code = String(body.code).toUpperCase();
  const { error } = await sb.from('schemes').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE
export async function DELETE(request: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
  const { error } = await supabaseAdmin().from('schemes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
