-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0002 — Profile change requests (admin-approved edits)
--
-- Rationale:
--   Certain identity/verification fields (GST, drug license, firm name, user
--   type) can't change silently — a compromised or careless customer edit on
--   these would break invoice compliance and destroy audit trail. So:
--     * Customers CAN edit low-risk fields directly (address, email, city, zone)
--     * Customers must SUBMIT a change request for sensitive fields;
--       admin reviews + approves in the panel.
--     * Phone changes go through OTP re-verification (auth layer, not here).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tighten the self-update policy ─────────────────────────────────────────
-- Lock down all identity/verification fields for direct customer edits.
DROP POLICY IF EXISTS users_self_update ON public.users;

CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Never editable by the user themselves — admin-controlled
    AND role                = (SELECT role                FROM public.users WHERE id = auth.uid())
    AND is_approved         = (SELECT is_approved         FROM public.users WHERE id = auth.uid())
    AND is_blocked          = (SELECT is_blocked          FROM public.users WHERE id = auth.uid())
    AND credit_balance      = (SELECT credit_balance      FROM public.users WHERE id = auth.uid())
    AND credit_limit        = (SELECT credit_limit        FROM public.users WHERE id = auth.uid())
    -- Identity/verification — change requires admin approval via
    -- profile_change_requests. IS NOT DISTINCT FROM handles NULL safely.
    AND phone               IS NOT DISTINCT FROM (SELECT phone               FROM public.users WHERE id = auth.uid())
    AND store_name          IS NOT DISTINCT FROM (SELECT store_name          FROM public.users WHERE id = auth.uid())
    AND gst_number          IS NOT DISTINCT FROM (SELECT gst_number          FROM public.users WHERE id = auth.uid())
    AND drug_license        IS NOT DISTINCT FROM (SELECT drug_license        FROM public.users WHERE id = auth.uid())
    AND registration_number IS NOT DISTINCT FROM (SELECT registration_number FROM public.users WHERE id = auth.uid())
    AND user_type           IS NOT DISTINCT FROM (SELECT user_type           FROM public.users WHERE id = auth.uid())
  );

-- ─── profile_change_requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_change_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  changes       JSONB NOT NULL,
    -- Allowed keys: store_name, gst_number, drug_license,
    --               registration_number, user_type.
    -- Format: { "gst_number": "22AAAAA0000A1Z5", "drug_license": "..." }
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_note    TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES public.users(id)
);
CREATE INDEX IF NOT EXISTS pcr_user_id_idx  ON public.profile_change_requests (user_id);
CREATE INDEX IF NOT EXISTS pcr_status_idx   ON public.profile_change_requests (status)
  WHERE status = 'Pending';

-- Only allow one pending request per user at a time (keeps the admin queue clean).
CREATE UNIQUE INDEX IF NOT EXISTS pcr_one_pending_per_user
  ON public.profile_change_requests (user_id) WHERE status = 'Pending';

-- ─── RLS on the new table ───────────────────────────────────────────────────
ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcr_self_select   ON public.profile_change_requests;
DROP POLICY IF EXISTS pcr_admin_select  ON public.profile_change_requests;
DROP POLICY IF EXISTS pcr_self_insert   ON public.profile_change_requests;
DROP POLICY IF EXISTS pcr_admin_update  ON public.profile_change_requests;

CREATE POLICY pcr_self_select ON public.profile_change_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY pcr_admin_select ON public.profile_change_requests
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Users can submit a new request for themselves, always as 'Pending'.
CREATE POLICY pcr_self_insert ON public.profile_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    -- Only allow the whitelisted fields
    AND (changes ?| ARRAY['store_name','gst_number','drug_license','registration_number','user_type'])
    AND NOT (changes ?| ARRAY['role','is_approved','is_blocked','credit_balance','credit_limit','phone'])
  );

CREATE POLICY pcr_admin_update ON public.profile_change_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── Helper functions — admin actions ───────────────────────────────────────

-- Apply an approved request atomically. Admin calls this.
CREATE OR REPLACE FUNCTION public.approve_profile_change(
  request_id BIGINT,
  admin_note_text TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  req RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve profile changes';
  END IF;

  SELECT * INTO req FROM public.profile_change_requests WHERE id = request_id FOR UPDATE;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Change request % not found', request_id;
  END IF;
  IF req.status <> 'Pending' THEN
    RAISE EXCEPTION 'Request % is already %', request_id, req.status;
  END IF;

  -- Apply only the fields present in the JSONB changes payload.
  UPDATE public.users
     SET
       store_name          = COALESCE(req.changes->>'store_name',          store_name),
       gst_number          = COALESCE(req.changes->>'gst_number',          gst_number),
       drug_license        = COALESCE(req.changes->>'drug_license',        drug_license),
       registration_number = COALESCE(req.changes->>'registration_number', registration_number),
       user_type           = COALESCE(req.changes->>'user_type',           user_type)
   WHERE id = req.user_id;

  UPDATE public.profile_change_requests
     SET status      = 'Approved',
         admin_note  = admin_note_text,
         reviewed_at = NOW(),
         reviewed_by = auth.uid()
   WHERE id = request_id;

  -- Notify the customer
  INSERT INTO public.notifications (user_id, for_admin, type, title, body, meta)
  VALUES (
    req.user_id, FALSE, 'profile_change_approved',
    'Profile update approved',
    'Your requested profile changes have been approved by admin.',
    jsonb_build_object('request_id', request_id, 'changes', req.changes)
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Reject a request. Admin calls this with an optional reason.
CREATE OR REPLACE FUNCTION public.reject_profile_change(
  request_id BIGINT,
  admin_note_text TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  req RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reject profile changes';
  END IF;

  SELECT * INTO req FROM public.profile_change_requests WHERE id = request_id FOR UPDATE;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Change request % not found', request_id;
  END IF;
  IF req.status <> 'Pending' THEN
    RAISE EXCEPTION 'Request % is already %', request_id, req.status;
  END IF;

  UPDATE public.profile_change_requests
     SET status      = 'Rejected',
         admin_note  = admin_note_text,
         reviewed_at = NOW(),
         reviewed_by = auth.uid()
   WHERE id = request_id;

  INSERT INTO public.notifications (user_id, for_admin, type, title, body, meta)
  VALUES (
    req.user_id, FALSE, 'profile_change_rejected',
    'Profile update rejected',
    COALESCE(admin_note_text, 'Your profile change request was not approved. Contact support for details.'),
    jsonb_build_object('request_id', request_id, 'changes', req.changes)
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ─── Auto-notify admins when a new request is submitted ─────────────────────
CREATE OR REPLACE FUNCTION public.notify_admins_on_pcr_insert()
RETURNS TRIGGER AS $$
DECLARE
  store TEXT;
BEGIN
  SELECT store_name INTO store FROM public.users WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, for_admin, type, title, body, meta)
  VALUES (
    NULL, TRUE, 'profile_change_requested',
    'New profile change request',
    COALESCE(store, 'A partner') || ' has requested profile updates.',
    jsonb_build_object('request_id', NEW.id, 'user_id', NEW.user_id, 'changes', NEW.changes)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_change_request ON public.profile_change_requests;
CREATE TRIGGER on_profile_change_request
  AFTER INSERT ON public.profile_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_pcr_insert();

-- ─── Realtime broadcast for the new table ───────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_change_requests;