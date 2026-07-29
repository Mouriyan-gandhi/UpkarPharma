import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { randomUUID } from 'crypto';

async function verifyFirebaseToken(idToken: string): Promise<string | null> {
  try {
    // Dynamic import to avoid initializing Firebase Admin when env vars are missing in dev.
    const { firebaseAuth } = await import('@/lib/firebase-admin');
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    // Return the verified phone number (e.g. "+919876543210")
    return decoded.phone_number || null;
  } catch (err) {
    console.error('[verify] Firebase token error:', err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, device_info = 'Unknown Device' } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Firebase ID token is required.' }, { status: 400 });
    }

    // Verify the Firebase ID token and extract the phone number
    const firebasePhone = await verifyFirebaseToken(idToken);
    if (!firebasePhone) {
      return NextResponse.json({ error: 'Invalid or expired Firebase token.' }, { status: 401 });
    }

    // Normalize: strip leading +91 and any spaces, store as 10-digit number
    const phone = firebasePhone.replace(/^\+91/, '').replace(/\s/g, '');

    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;

    if (!user) {
      return NextResponse.json(
        { error: 'Phone number not registered. Please sign up first.' },
        { status: 404 }
      );
    }

    if (!user.is_approved) {
      return NextResponse.json(
        { error: 'Account pending admin approval.', pending: true, user },
        { status: 403 }
      );
    }

    // Enforce max 4 concurrent mobile sessions (evict oldest)
    const sessions = db
      .prepare('SELECT id FROM sessions WHERE user_phone = ? ORDER BY last_active ASC')
      .all(phone) as any[];

    if (sessions.length >= 4) {
      const toRemove = sessions.slice(0, sessions.length - 3);
      for (const s of toRemove) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
      }
    }

    const sessionId = randomUUID();
    db.prepare('INSERT INTO sessions (id, user_phone, device_info) VALUES (?, ?, ?)').run(
      sessionId,
      phone,
      device_info
    );

    const { password_hash: _ph, ...safeUser } = user as any;

    return NextResponse.json({
      success: true,
      user: safeUser,
      session_id: sessionId,
      message: 'Login successful',
    });
  } catch (err) {
    console.error('OTP Verification Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
