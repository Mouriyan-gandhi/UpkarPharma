-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0005 — Optional google_maps_link on users
--
-- Customers paste a Google Maps pin/share URL so delivery drivers can navigate
-- straight to the shop instead of parsing a free-text address. Admin sees it
-- on the partner detail view and can tap through.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

-- Whitelist the new field for direct customer self-edits. Mirrors the pattern
-- already used for address/email/city/zone: customer can change freely (no
-- admin approval needed — it's not a compliance field).
DROP POLICY IF EXISTS users_self_update ON public.users;

CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role                = (SELECT role                FROM public.users WHERE id = auth.uid())
    AND is_approved         = (SELECT is_approved         FROM public.users WHERE id = auth.uid())
    AND is_blocked          = (SELECT is_blocked          FROM public.users WHERE id = auth.uid())
    AND credit_balance      = (SELECT credit_balance      FROM public.users WHERE id = auth.uid())
    AND credit_limit        = (SELECT credit_limit        FROM public.users WHERE id = auth.uid())
    AND phone               IS NOT DISTINCT FROM (SELECT phone               FROM public.users WHERE id = auth.uid())
    AND store_name          IS NOT DISTINCT FROM (SELECT store_name          FROM public.users WHERE id = auth.uid())
    AND gst_number          IS NOT DISTINCT FROM (SELECT gst_number          FROM public.users WHERE id = auth.uid())
    AND drug_license        IS NOT DISTINCT FROM (SELECT drug_license        FROM public.users WHERE id = auth.uid())
    AND registration_number IS NOT DISTINCT FROM (SELECT registration_number FROM public.users WHERE id = auth.uid())
    AND user_type           IS NOT DISTINCT FROM (SELECT user_type           FROM public.users WHERE id = auth.uid())
  );
