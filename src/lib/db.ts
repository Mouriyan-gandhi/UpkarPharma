// ═════════════════════════════════════════════════════════════════════════
// DEPRECATED — SQLite runtime is retired. All data now lives in Supabase.
// Any route that still imports this receives a Proxy that throws on use.
// Port callers to @/lib/supabase/admin or @/lib/supabase/server.
// ═════════════════════════════════════════════════════════════════════════

const throwOnUse = new Proxy({}, {
  get() {
    throw new Error(
      '[lib/db] SQLite retired. Migrate this call to @/lib/supabase/admin.'
    );
  },
});

export default throwOnUse as any;
export function initDB() {}
