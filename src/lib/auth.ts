import { supabaseServer } from './supabase/server';
import { supabaseAdmin } from './supabase/admin';

// Public shape used across API routes + admin pages.
export interface AdminUser {
  id: string;            // auth.users UUID
  phone: string;
  store_name?: string;
  role: 'admin' | 'client';
  is_approved: boolean;
  is_blocked: boolean;
}

/**
 * Returns the current admin user if the caller has a valid Supabase session AND
 * their public.users row has role='admin' and is not blocked. Otherwise null.
 *
 * Uses the request's cookies to identify the caller. Safe in API routes + RSC.
 */
export async function getAdmin(): Promise<AdminUser | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Look up the profile via service-role (bypasses RLS to avoid recursion).
  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from('users')
    .select('id, phone, store_name, role, is_approved, is_blocked')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return null;
  if (profile.role !== 'admin' || profile.is_blocked) return null;
  return profile as AdminUser;
}

/**
 * Returns the current mobile client user, if the caller has a valid Supabase
 * session AND the user is approved + not blocked. Used by /api/data endpoints
 * that mobile hits with the Supabase session token in the Authorization header.
 */
export async function getMobileUser(request: Request): Promise<AdminUser | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return null;

  const admin = supabaseAdmin();
  const { data: { user }, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !user) return null;

  const { data: profile, error } = await admin
    .from('users')
    .select('id, phone, store_name, role, is_approved, is_blocked')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return null;
  if (!profile.is_approved || profile.is_blocked) return null;
  return profile as AdminUser;
}

/**
 * Returns the current customer if there's a valid Supabase COOKIE session
 * (used by the web customer app /shop/*). Returns admins too — admins can
 * preview the customer view. Requires approved + not blocked.
 */
export async function getWebUser(): Promise<AdminUser | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from('users')
    .select('id, phone, store_name, role, is_approved, is_blocked')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return null;
  if (profile.is_blocked || !profile.is_approved) return null;
  return profile as AdminUser;
}

/**
 * Compat shim — some old routes reference these session functions.
 * Supabase Auth manages sessions natively so these are no-ops now.
 */
export function listAdminSessions(): any[] {
  return [];
}
