import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Grid view columns — kept intentionally narrow to keep the payload small
// and the DB read cheap. The product detail modal re-fetches by id and can
// select the full row (description, composition, drug_name, hsn, gst_percent,
// expiry_date, images).
const GRID_COLUMNS =
  'id, name, code, company, category, body_system, packing, price, price_ptr, mrp, stock, image_url, short_expiry, discount_percent';
const DETAIL_COLUMNS = '*';

// GET /api/shop/products
//   ?q=search    (ilike on name / drug_name / company — backed by pg_trgm)
//   ?category=X
//   ?short_expiry=1
//   ?page=1&perPage=48
//   ?ids=1,2,3   (fetch specific products for cart hydration — returns full row)
export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const category = url.searchParams.get('category') || '';
  const subCategory = url.searchParams.get('sub_category') || '';
  const shortExpiry = url.searchParams.get('short_expiry') === '1';
  const ids = url.searchParams.get('ids');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '48')));

  const sb = supabaseAdmin();

  // Specific-ids fetch (cart hydration) needs the full row.
  if (ids) {
    const idList = ids.split(',').map((s) => Number(s.trim())).filter(Boolean);
    if (idList.length === 0) return NextResponse.json({ products: [], total: 0 });
    const { data, error } = await sb.from('products').select(DETAIL_COLUMNS).in('id', idList);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data || [], total: data?.length || 0 });
  }

  // For the grid: count is expensive on 5k+ rows. Only ask for it on page 1
  // (when the UI needs to render "N products" + pagination). On page ≥ 2 the
  // client can derive `hasMore` from `products.length === perPage`.
  const wantCount = page === 1;

  let query = sb.from('products').select(
    GRID_COLUMNS,
    wantCount ? { count: 'estimated' } : undefined,
  );

  if (q) query = query.or(`name.ilike.%${q}%,drug_name.ilike.%${q}%,company.ilike.%${q}%`);
  if (category) query = query.eq('category', category);
  if (subCategory) query = query.eq('body_system', subCategory);
  if (shortExpiry) query = query.eq('short_expiry', true);

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.order('name', { ascending: true }).range(from, to);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const products = data || [];
  const hasMore = wantCount
    ? (count || 0) > to + 1
    : products.length === perPage;

  return NextResponse.json({
    products,
    total: wantCount ? (count || 0) : undefined,
    page,
    perPage,
    hasMore,
  });
}
