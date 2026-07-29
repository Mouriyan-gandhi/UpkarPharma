import { NextResponse } from 'next/server';
import { getAdmin, listAdminSessions, deleteAdminSession } from '@/lib/auth';

// GET /api/auth/sessions — list all active admin sessions
export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sessions = listAdminSessions();
  return NextResponse.json({ sessions, currentSessionId: admin.session_id });
}

// DELETE /api/auth/sessions?id=<sessionId> — revoke a specific session
export async function DELETE(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Session ID required' }, { status: 400 });

  deleteAdminSession(id);
  return NextResponse.json({ success: true });
}
