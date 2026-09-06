-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0009 — Allow 'address' in profile_change_requests
--
-- The 0002 RLS policy hardcoded the allowed change-request keys, so pushing
-- a new field (address) required a policy rewrite. Widened to include
-- address; user_type came off since it's now self-editable.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS pcr_self_insert ON public.profile_change_requests;

CREATE POLICY pcr_self_insert ON public.profile_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND (changes ?| ARRAY['store_name','gst_number','drug_license','registration_number','address'])
    AND NOT (changes ?| ARRAY['role','is_approved','is_blocked','credit_balance','credit_limit','phone'])
  );
