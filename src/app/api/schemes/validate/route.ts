import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, order_subtotal } = body;

    // Validate against the authenticated user, not a client-supplied phone.
    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user_phone = sessionUser.phone;

    if (!code || order_subtotal === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Check if coupon exists and is active
    const scheme = db.prepare('SELECT * FROM schemes WHERE code = ? AND is_active = 1').get(code.toUpperCase()) as any;
    if (!scheme) {
      return NextResponse.json({ error: 'Invalid or inactive scheme code.' }, { status: 400 });
    }

    // 2. Check date validity
    const today = new Date().toISOString().split('T')[0];
    if (today < scheme.start_date || today > scheme.end_date) {
      return NextResponse.json({ error: 'This scheme is not currently active based on date.' }, { status: 400 });
    }

    // 3. Check minimum order value
    if (scheme.min_order_value && order_subtotal < scheme.min_order_value) {
      return NextResponse.json({ error: `Min. order value of ₹${scheme.min_order_value.toLocaleString('en-IN')} required.` }, { status: 400 });
    }

    // 4. Check global usage limit
    if (scheme.usage_limit > 0 && scheme.times_used >= scheme.usage_limit) {
      return NextResponse.json({ error: 'This scheme code has reached its global usage limit.' }, { status: 400 });
    }

    // 5. Check per-user limit
    if (scheme.per_user_limit > 0) {
      const usage = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_phone = ? AND scheme_code = ?').get(user_phone, scheme.code) as any;
      if (usage.count >= scheme.per_user_limit) {
        return NextResponse.json({ error: `You have reached the limit of ${scheme.per_user_limit} uses for this coupon.` }, { status: 400 });
      }
    }

    // Passed all checks! Return the scheme details.
    return NextResponse.json({ success: true, scheme });
  } catch (err) {
    console.error('Schemes Validation Error:', err);
    return NextResponse.json({ error: 'Failed to validate scheme' }, { status: 500 });
  }
}
