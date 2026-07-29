import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import * as jose from 'jose';
import { JWT_SECRET, createAdminSession, deleteAdminSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { phone, password } = await request.json();

    if (!phone || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!user.is_approved) {
      return NextResponse.json({ error: 'Account pending approval' }, { status: 403 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Admins only.' }, { status: 403 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Create a DB-tracked session so we can revoke it independently
    const userAgent = request.headers.get('user-agent') || 'Unknown Browser';
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'Unknown';
    const sessionId = createAdminSession(user.phone, userAgent, ip);

    const alg = 'HS256';
    const jwt = await new jose.SignJWT({
      phone: user.phone,
      role: user.role,
      store_name: user.store_name,
      session_id: sessionId,
    })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      store_name: user.store_name,
      role: user.role,
    });

    response.cookies.set({
      name: 'admin_session',
      value: jwt,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err) {
    console.error('Login Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  // Revoke the specific DB session so other concurrent admin sessions are unaffected.
  try {
    const store = await cookies();
    const token = store.get('admin_session')?.value;
    if (token) {
      const { payload } = await jose.jwtVerify(token, JWT_SECRET).catch(() => ({ payload: null }));
      const sessionId = (payload as any)?.session_id as string | undefined;
      if (sessionId) deleteAdminSession(sessionId);
    }
  } catch { /* best-effort: still delete the cookie */ }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_session');
  return response;
}
