import { supabaseAdmin } from './supabase/admin';

// ═══════════════════════════════════════════════════════════════════════════
// Shared push-notification helper — Expo push service.
//
// Fires best-effort (never throws, never blocks the API response). Callers
// should NOT await this if they can help it; use void pushToAdmins(...).
//
// Also inserts a row into public.notifications so the in-app bell also lights
// up, even if the push itself is dropped (device offline, token stale, etc.).
// One helper = one truth for "the admin should hear about this."
// ═══════════════════════════════════════════════════════════════════════════

type PushOpts = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  type: string;         // notification.type — used for deeplink routing on tap
  actorLabel?: string;  // "Dhruv Pharma" — prepended in the bell if provided
};

async function sendExpo(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  const clean = tokens.filter((t): t is string => !!t && typeof t === 'string');
  if (clean.length === 0) return;
  // Expo accepts an array of up to 100 messages per POST.
  const messages = clean.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('[push] send failed:', err);
  }
}

/** Notify every admin — used for signups, orders, credit requests, change requests. */
export async function pushToAdmins(opts: PushOpts) {
  const sb = supabaseAdmin();
  try {
    // 1. Bell entry (works even if push fails)
    await sb.from('notifications').insert({
      for_admin: true,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      meta: opts.data || {},
    });
    // 2. Real push
    const { data: admins } = await sb.from('users')
      .select('expo_push_token')
      .eq('role', 'admin')
      .not('expo_push_token', 'is', null);
    const tokens = (admins || []).map((a: any) => a.expo_push_token);
    void sendExpo(tokens, opts.title, opts.body, { ...(opts.data || {}), type: opts.type });
  } catch (err) {
    console.error('[push] pushToAdmins failed:', err);
  }
}

/** Notify a specific customer — used for approvals, invoice ready, credit decisions. */
export async function pushToUser(userId: string, opts: PushOpts) {
  const sb = supabaseAdmin();
  try {
    await sb.from('notifications').insert({
      user_id: userId,
      for_admin: false,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      meta: opts.data || {},
    });
    const { data: user } = await sb.from('users')
      .select('expo_push_token')
      .eq('id', userId)
      .maybeSingle();
    if (user?.expo_push_token) {
      void sendExpo([user.expo_push_token], opts.title, opts.body, { ...(opts.data || {}), type: opts.type });
    }
  } catch (err) {
    console.error('[push] pushToUser failed:', err);
  }
}
