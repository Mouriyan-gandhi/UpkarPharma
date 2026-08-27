import { NextResponse } from 'next/server';
import { getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const body = await request.json();
  const { code, order_subtotal } = body;

  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!code || order_subtotal === undefined) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: scheme } = await sb.from('schemes').select('*')
    .eq('code', String(code).toUpperCase()).eq('is_active', true).maybeSingle();
  if (!scheme) return NextResponse.json({ error: 'Invalid or inactive scheme code.' }, { status: 400 });

  const today = new Date().toISOString().split('T')[0];
  if (today < scheme.start_date || today > scheme.end_date) {
    return NextResponse.json({ error: 'This scheme is not currently active based on date.' }, { status: 400 });
  }
  if (scheme.min_order_value && order_subtotal < scheme.min_order_value) {
    return NextResponse.json({ error: `Min. order value of ₹${scheme.min_order_value.toLocaleString('en-IN')} required.` }, { status: 400 });
  }
  if (scheme.usage_limit > 0 && scheme.times_used >= scheme.usage_limit) {
    return NextResponse.json({ error: 'This scheme code has reached its global usage limit.' }, { status: 400 });
  }
  if (scheme.per_user_limit > 0) {
    const { count } = await sb.from('orders').select('*', { head: true, count: 'exact' })
      .eq('user_id', user.id).eq('scheme_code', scheme.code);
    if ((count || 0) >= scheme.per_user_limit) {
      return NextResponse.json({ error: `You have reached the limit of ${scheme.per_user_limit} uses for this coupon.` }, { status: 400 });
    }
  }
  return NextResponse.json({ success: true, scheme });
}
