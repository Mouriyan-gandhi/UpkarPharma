import { cookies } from 'next/headers';
import * as jose from 'jose';
import db from './db';

// Centralized JWT secret. In production this MUST come from the environment.
const rawSecret = process.env.JWT_SECRET;
if (!rawSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production.');
}
// Dev-only fallback. Keep this string identical to the one in middleware.ts.
export const JWT_SECRET = new TextEncoder().encode(
  rawSecret || 'upkem-dev-only-secret-change-me'
);

export interface AdminPayload {
  phone: string;
  role: string;
  store_name?: string;
}

/**
 * Verify the admin dashboard session (httpOnly `admin_session` JWT cookie).
 * Returns the payload only for users with the `admin` role, else null.
 * Used by same-origin requests from the Next.js admin dashboard.
 */
export async function getAdmin(): Promise<AdminPayload | null> {
  try {
    const store = await cookies();
    const token = store.get('admin_session')?.value;
    if (!token) return null;
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    if (payload.role !== 'admin') return null;
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

/**
 * Verify a mobile client session. The mobile app sends the `session_id`
 * (issued by /api/auth/verify and stored in the `sessions` table) as a
 * Bearer token. Returns the approved user row, or null.
 */
export function getSessionUser(request: Request): any | null {
  const authHeader = request.headers.get('authorization') || '';
  const headerId = request.headers.get('x-session-id') || '';
  const sessionId = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : headerId.trim();

  if (!sessionId) return null;

  const session = db
    .prepare('SELECT user_phone FROM sessions WHERE id = ?')
    .get(sessionId) as { user_phone: string } | undefined;
  if (!session) return null;

  const user = db
    .prepare('SELECT * FROM users WHERE phone = ?')
    .get(session.user_phone) as any;
  if (!user || !user.is_approved) return null;

  // Touch the session so the oldest-session eviction logic stays meaningful.
  db.prepare('UPDATE sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

  return user;
}
