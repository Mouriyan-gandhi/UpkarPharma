import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/shop/products
//   ?q=search    (full-text on name + drug_name + company)
//   ?category=X
//   ?short_expiry=1
//   ?page=1&perPage=48
//   ?ids=1,2,3   (fetch specific products, for cart hydration)
export async function GET(request: Request) {
  // Must be logged in — customer web uses cookie session
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim().toLowerCase() || '';
  const category = url.searchParams.get('category') || '';
  const shortExpiry = url.searchParams.get('short_expiry') === '1';
  const ids = url.searchParams.get('ids');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '48')));

  const sb = supabaseAdmin();
  let query = sb.from('products').select(
    'id, name, code, company, category, packing, hsn, gst_percent, price, price_ptr, mrp, stock, description, composition, drug_name, image_url, images, short_expiry, discount_percent, expiry_date',
    { count: 'exact' }
  );

  // If specific ids requested, ignore other filters
  if (ids) {
    const idList = ids.split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (idList.length === 0) return NextResponse.json({ products: [], total: 0 });
    query = query.in('id', idList);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data || [], total: data?.length || 0 });
  }

  if (q) query = query.or(`name.ilike.%${q}%,drug_name.ilike.%${q}%,company.ilike.%${q}%`);
  if (category) query = query.eq('category', category);
  if (shortExpiry) query = query.eq('short_expiry', true);

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.order('name', { ascending: true }).range(from, to);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    products: data || [],
    total: count || 0,
    page,
    perPage,
    hasMore: (count || 0) > to + 1,
  });
}
