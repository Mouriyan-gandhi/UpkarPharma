import { NextResponse } from 'next/server';
import { getMobileUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Register the Expo push notification token for the authenticated mobile user.
export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    const user = await getMobileUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const { error } = await supabaseAdmin()
      .from('users')
      .update({ expo_push_token: token })
      .eq('id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Token Registration Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
