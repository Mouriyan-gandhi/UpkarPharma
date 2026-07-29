import { cookies } from 'next/headers';
import * as jose from 'jose';
import { randomUUID } from 'crypto';
import db from './db';

const rawSecret = process.env.JWT_SECRET;
if (!rawSecret) {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('JWT_SECRET environment variable is required.');
  }
  console.warn('[auth] JWT_SECRET not set — using insecure dev fallback. Set it before deploying.');
}
export const JWT_SECRET = new TextEncoder().encode(
  rawSecret || 'upkem-dev-only-secret-change-me'
);

export interface AdminPayload {
  phone: string;
  role: string;
  store_name?: string;
  session_id?: string;
}

/**
 * Verify the admin dashboard session cookie.
 * Validates the JWT AND confirms the session still exists in admin_sessions
 * (allows per-session revocation across concurrent admin logins).
 */
export async function getAdmin(): Promise<AdminPayload | null> {
  try {
    const store = await cookies();
    const token = store.get('admin_session')?.value;
    if (!token) return null;
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    if (payload.role !== 'admin') return null;

    const sessionId = payload.session_id as string | undefined;
    if (!sessionId) return null;

    const session = db
      .prepare('SELECT id FROM admin_sessions WHERE id = ?')
      .get(sessionId) as { id: string } | undefined;
    if (!session) return null;

    db.prepare('UPDATE admin_sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

/** Create a new admin session row. Returns the new session ID. */
export function createAdminSession(phone: string, userAgent: string, ip: string): string {
  const sessionId = randomUUID();
  db.prepare(
    'INSERT INTO admin_sessions (id, phone, user_agent, ip) VALUES (?, ?, ?, ?)'
  ).run(sessionId, phone, userAgent, ip);
  return sessionId;
}

/** Delete a specific admin session (logout or revoke). */
export function deleteAdminSession(sessionId: string): void {
  db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sessionId);
}

/** List all active admin sessions. */
export function listAdminSessions(): any[] {
  return db
    .prepare('SELECT id, phone, user_agent, ip, created_at, last_active FROM admin_sessions ORDER BY last_active DESC')
    .all() as any[];
}

/**
 * Verify a mobile client session bearer token.
 * Returns the approved user row, or null.
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

  db.prepare('UPDATE sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

  return user;
}
