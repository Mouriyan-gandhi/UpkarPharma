-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0006 — Add products + users to supabase_realtime publication
--
-- So mobile clients can subscribe to postgres_changes on these tables:
--   * products → customer + admin see photo/description/price edits
--                the moment admin hits Save (was 3s polling lag before).
--   * users    → customer sees credit_limit bumps immediately after admin
--                approves a credit request; admin sees profile edits
--                the moment a partner changes their address/maps link.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
