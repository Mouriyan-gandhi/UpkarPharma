import { NextResponse } from 'next/server';
import { getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Delete the authenticated mobile user's account and all related data.
// Cascades handle order_items, orders, invoices, notifications, etc.
// Also removes the auth.users row so the phone can re-signup fresh.
export async function DELETE(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  try {
    // Remove auth user (cascades to public.users via ON DELETE CASCADE).
    const { error } = await sb.auth.admin.deleteUser(user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Account deletion error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete account' }, { status: 500 });
  }
}
