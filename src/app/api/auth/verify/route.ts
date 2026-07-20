import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  try {
    const { phone, otp, device_info = 'Unknown Device' } = await request.json();

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 });
    }

    // Verify mock OTP
    if (otp !== '1234') {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 });
    }

    // Check user
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;
    
    if (!user) {
      return NextResponse.json({ error: 'User not found. Please register first.' }, { status: 404 });
    }

    if (!user.is_approved) {
      return NextResponse.json({ error: 'Account pending admin approval.', pending: true, user }, { status: 403 });
    }

    // Session Control: Enforce max 4 sessions
    const sessions = db.prepare('SELECT id FROM sessions WHERE user_phone = ? ORDER BY last_active ASC').all(phone) as any[];
    
    if (sessions.length >= 4) {
      // Remove the oldest session(s) to make room
      const excessCount = sessions.length - 3;
      for (let i = 0; i < excessCount; i++) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sessions[i].id);
      }
    }

    // Create new session
    const sessionId = randomUUID();
    db.prepare('INSERT INTO sessions (id, user_phone, device_info) VALUES (?, ?, ?)').run(sessionId, phone, device_info);

    // Strip sensitive fields before sending to mobile client.
    const { password_hash: _ph, ...safeUser } = user as any;

    return NextResponse.json({
      success: true,
      user: safeUser,
      session_id: sessionId,
      message: 'Login successful'
    });
  } catch (err) {
    console.error('OTP Verification Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
