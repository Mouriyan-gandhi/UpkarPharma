import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Per-request server client. Reads + writes the Supabase auth cookie so
// subsequent requests stay authenticated. Respects Row-Level Security.
// Use in server components + API routes when you want the caller's identity.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Setting cookies from a Server Component throws; that's fine —
            // the middleware or a Route Handler will do the actual set.
          }
        },
      },
    }
  );
}
