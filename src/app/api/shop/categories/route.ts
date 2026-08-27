import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Distinct categories from the product master. Cached for a minute.
let cached: { at: number; list: string[] } | null = null;

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (cached && Date.now() - cached.at < 60_000) {
    return NextResponse.json({ categories: cached.list });
  }

  const sb = supabaseAdmin();
  // Page through to get all products, then unique the categories.
  const all: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from('products').select('category').range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) break;
    for (const r of data) if (r.category) all.push(r.category);
    if (data.length < pageSize) break;
  }
  const list = Array.from(new Set(all)).sort();
  cached = { at: Date.now(), list };
  return NextResponse.json({ categories: list });
}
