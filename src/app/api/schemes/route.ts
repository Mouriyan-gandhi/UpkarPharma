import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdmin, getSessionUser } from '@/lib/auth';

// GET — fetch all schemes (admin), or active-only via ?active=true (mobile)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';

    // Active-only is the mobile catalog feed (any logged-in user); the full
    // list is admin-only.
    const admin = await getAdmin();
    if (activeOnly) {
      if (!admin && !getSessionUser(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let schemes;
    if (activeOnly) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      schemes = db.prepare(`
        SELECT * FROM schemes 
        WHERE is_active = 1 AND start_date <= ? AND end_date >= ?
        ORDER BY created_at DESC
      `).all(today, today);
    } else {
      schemes = db.prepare('SELECT * FROM schemes ORDER BY created_at DESC').all();
    }

    return NextResponse.json({ schemes });
  } catch (err) {
    console.error('Schemes GET Error:', err);
    return NextResponse.json({ error: 'Failed to fetch schemes' }, { status: 500 });
  }
}

// POST — create a new scheme
export async function POST(request: Request) {
  try {
    if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await request.json();
    const {
      title, description, code, scheme_type,
      discount_percent, flat_discount, min_order_value,
      max_discount, start_date, end_date, usage_limit, per_user_limit
    } = body;

    if (!title || !code || !scheme_type || !start_date || !end_date) {
      return NextResponse.json({ error: 'Title, Code, Type, Start/End dates are required' }, { status: 400 });
    }

    // Check for duplicate code
    const existing = db.prepare('SELECT id FROM schemes WHERE code = ?').get(code.toUpperCase());
    if (existing) {
      return NextResponse.json({ error: 'A scheme with this code already exists' }, { status: 400 });
    }

    const insertScheme = db.prepare(`
      INSERT INTO schemes (
        title, description, code, scheme_type,
        discount_percent, flat_discount, min_order_value,
        max_discount, start_date, end_date, usage_limit, per_user_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertScheme.run(
      title,
      description || null,
      code.toUpperCase(),
      scheme_type,
      discount_percent || null,
      flat_discount || null,
      min_order_value || 0,
      max_discount || null,
      start_date,
      end_date,
      usage_limit || 0,
      per_user_limit !== undefined ? per_user_limit : 1
    );

    return NextResponse.json({ success: true, message: 'Scheme created successfully' });
  } catch (err) {
    console.error('Schemes POST Error:', err);
    return NextResponse.json({ error: 'Failed to create scheme' }, { status: 500 });
  }
}

// PUT — update a scheme (edit or toggle active)
export async function PUT(request: Request) {
  try {
    if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
    }

    if (action === 'toggle') {
      db.prepare('UPDATE schemes SET is_active = NOT is_active WHERE id = ?').run(id);
      return NextResponse.json({ success: true });
    }

    // Full update
    const {
      title, description, code, scheme_type,
      discount_percent, flat_discount, min_order_value,
      max_discount, start_date, end_date, usage_limit, per_user_limit
    } = body;

    db.prepare(`
      UPDATE schemes SET
        title = ?, description = ?, code = ?, scheme_type = ?,
        discount_percent = ?, flat_discount = ?, min_order_value = ?,
        max_discount = ?, start_date = ?, end_date = ?, usage_limit = ?, per_user_limit = ?
      WHERE id = ?
    `).run(
      title, description || null, code?.toUpperCase(), scheme_type,
      discount_percent || null, flat_discount || null, min_order_value || 0,
      max_discount || null, start_date, end_date, usage_limit || 0,
      per_user_limit !== undefined ? per_user_limit : 1,
      id
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Schemes PUT Error:', err);
    return NextResponse.json({ error: 'Failed to update scheme' }, { status: 500 });
  }
}

// DELETE — delete a scheme
export async function DELETE(request: Request) {
  try {
    if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM schemes WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Schemes DELETE Error:', err);
    return NextResponse.json({ error: 'Failed to delete scheme' }, { status: 500 });
  }
}
