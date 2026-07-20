import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    // The push token may only be registered for the authenticated user.
    const user = getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const updateToken = db.prepare('UPDATE users SET expo_push_token = ? WHERE phone = ?');
    const result = updateToken.run(token, user.phone);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Token Registration Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
