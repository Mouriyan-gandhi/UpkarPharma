import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Distinct categories from the product master + optional sub-categories
// (backed by the `body_system` column) when ?category=X is supplied.
// Cached separately per query for a minute.
type Cache = { at: number; categories: string[]; sub: Record<string, string[]> };
let cached: Cache | null = null;

async function loadFull() {
  const sb = supabaseAdmin();
  const rows: { category: string | null; body_system: string | null }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('products')
      .select('category, body_system')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  const catSet = new Set<string>();
  const subMap = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.category) {
      catSet.add(r.category);
      if (r.body_system) {
        const s = subMap.get(r.category) ?? new Set<string>();
        s.add(r.body_system);
        subMap.set(r.category, s);
      }
    }
  }
  const categories = Array.from(catSet).sort();
  const sub: Record<string, string[]> = {};
  for (const [k, v] of subMap) sub[k] = Array.from(v).sort();
  return { categories, sub };
}

export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!cached || Date.now() - cached.at > 60_000) {
    try {
      const { categories, sub } = await loadFull();
      cached = { at: Date.now(), categories, sub };
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  if (category) {
    return NextResponse.json({
      categories: cached.categories,
      sub_categories: cached.sub[category] || [],
    });
  }
  return NextResponse.json({ categories: cached.categories });
}
