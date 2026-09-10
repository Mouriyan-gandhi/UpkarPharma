import { supabaseServer } from './supabase/server';
import { supabaseAdmin } from './supabase/admin';

// Public shape used across API routes + admin pages.
// Named AdminUser for legacy reasons — actually represents any authenticated
// public.users row (admin OR client), so credit fields are included here.
export interface AdminUser {
  id: string;            // auth.users UUID
  phone: string;
  store_name?: string;
  role: 'admin' | 'client';
  is_approved: boolean;
  is_blocked: boolean;
  is_rejected?: boolean;
  rejected_reason?: string | null;
  credit_balance?: number;
  credit_limit?: number;
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
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return null;
  if (profile.role !== 'admin' || profile.is_blocked) return null;
  return profile as AdminUser;
}

/**
 * Returns the current mobile client user, if the caller has a valid Supabase
 * session AND the user isn't blocked. Pending + rejected users ARE returned
 * (they can browse the catalog + complete their profile; mutations that
 * require approval — orders.create, credit-requests — check is_approved
 * separately downstream).
 *
 * Used by /api/data reads, /api/notifications, brochures, etc.
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
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return null;
  // Block only the hard-blocked users. Pending / rejected pass through so
  // they can see the catalog + complete signup info. Mutations gate on
  // is_approved separately.
  if (profile.is_blocked) return null;
  return profile as AdminUser;
}

/**
 * Returns the mobile user ONLY if they're fully approved and not rejected/blocked.
 * Use for mutations that require an active account: order placement, credit
 * requests, profile change requests. Reads should keep using getMobileUser.
 */
export async function getApprovedMobileUser(request: Request): Promise<AdminUser | null> {
  const user = await getMobileUser(request);
  if (!user) return null;
  if (!user.is_approved || (user as any).is_rejected) return null;
  return user;
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
    .select('*')
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

/**
 * Returns an admin from EITHER the web cookie session (getAdmin) OR the
 * mobile bearer token (getMobileUser + role check). Use this in API routes
 * that must accept admins from both channels — e.g. invoice approval,
 * product edits from the mobile admin app.
 */
export async function getAnyAdmin(request: Request): Promise<AdminUser | null> {
  const cookieAdmin = await getAdmin();
  if (cookieAdmin) return cookieAdmin;
  const mobile = await getMobileUser(request);
  if (mobile && (mobile as { role?: string }).role === 'admin') return mobile;
  return null;
}
