import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function DELETE(request: Request) {
  const user = getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deleteAll = db.transaction((phone: string) => {
      // Remove all sessions first (FK target)
      db.prepare('DELETE FROM sessions WHERE user_phone = ?').run(phone);
      // Remove order line items before orders (FK target)
      db.prepare(
        'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_phone = ?)'
      ).run(phone);
      // Remove invoices
      db.prepare('DELETE FROM invoices WHERE user_phone = ?').run(phone);
      // Remove orders
      db.prepare('DELETE FROM orders WHERE user_phone = ?').run(phone);
      // Finally remove the user
      db.prepare('DELETE FROM users WHERE phone = ?').run(phone);
    });

    deleteAll(user.phone);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
