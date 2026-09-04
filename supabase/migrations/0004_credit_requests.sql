-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0004 — Credit requests (customer asks for a higher limit, admin
-- reviews). Mirrors the shape of 0002_profile_change_requests so admins have
-- a consistent review workflow across all customer-initiated changes.
--
-- Flow:
--   1. Customer submits { amount, note } via /api/credit-requests
--   2. Trigger fires a "new credit request" notification to all admins
--   3. Admin approves → user.credit_limit bumped by the requested amount,
--      status → Approved, customer gets a notification
--   4. Admin rejects → status → Rejected, customer gets a notification
--      with the admin's reason
--
-- Only one Pending request per user at a time so the admin queue stays tidy.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.credit_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  note          TEXT,   -- optional customer justification
  status        TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_note    TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS cr_user_id_idx  ON public.credit_requests (user_id);
CREATE INDEX IF NOT EXISTS cr_status_idx   ON public.credit_requests (status)
  WHERE status = 'Pending';

-- Only one pending request per user (keeps the admin queue clean).
CREATE UNIQUE INDEX IF NOT EXISTS cr_one_pending_per_user
  ON public.credit_requests (user_id) WHERE status = 'Pending';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cr_self_select   ON public.credit_requests;
DROP POLICY IF EXISTS cr_admin_select  ON public.credit_requests;
DROP POLICY IF EXISTS cr_self_insert   ON public.credit_requests;
DROP POLICY IF EXISTS cr_admin_update  ON public.credit_requests;

CREATE POLICY cr_self_select ON public.credit_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY cr_admin_select ON public.credit_requests
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY cr_self_insert ON public.credit_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND amount > 0
  );

CREATE POLICY cr_admin_update ON public.credit_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── Approve / Reject helpers ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_credit_request(
  request_id BIGINT,
  admin_note_text TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  req RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve credit requests';
  END IF;

  SELECT * INTO req FROM public.credit_requests WHERE id = request_id FOR UPDATE;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Credit request % not found', request_id;
  END IF;
  IF req.status <> 'Pending' THEN
    RAISE EXCEPTION 'Request % is already %', request_id, req.status;
  END IF;

  -- Bump the customer's credit limit by the requested amount.
  UPDATE public.users
     SET credit_limit = COALESCE(credit_limit, 0) + req.amount
   WHERE id = req.user_id;

  UPDATE public.credit_requests
     SET status      = 'Approved',
         admin_note  = admin_note_text,
         reviewed_at = NOW(),
         reviewed_by = auth.uid()
   WHERE id = request_id;

  INSERT INTO public.notifications (user_id, for_admin, type, title, body, meta)
  VALUES (
    req.user_id, FALSE, 'credit_request_approved',
    'Credit request approved',
    'Your request for ₹' || req.amount::TEXT || ' additional credit has been approved.',
    jsonb_build_object('request_id', request_id, 'amount', req.amount)
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reject_credit_request(
  request_id BIGINT,
  admin_note_text TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  req RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reject credit requests';
  END IF;

  SELECT * INTO req FROM public.credit_requests WHERE id = request_id FOR UPDATE;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Credit request % not found', request_id;
  END IF;
  IF req.status <> 'Pending' THEN
    RAISE EXCEPTION 'Request % is already %', request_id, req.status;
  END IF;

  UPDATE public.credit_requests
     SET status      = 'Rejected',
         admin_note  = admin_note_text,
         reviewed_at = NOW(),
         reviewed_by = auth.uid()
   WHERE id = request_id;

  INSERT INTO public.notifications (user_id, for_admin, type, title, body, meta)
  VALUES (
    req.user_id, FALSE, 'credit_request_rejected',
    'Credit request declined',
    COALESCE(admin_note_text, 'Your credit request was not approved. Contact support for details.'),
    jsonb_build_object('request_id', request_id, 'amount', req.amount)
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ─── Auto-notify admins on new request ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_admins_on_credit_request()
RETURNS TRIGGER AS $$
DECLARE
  store TEXT;
BEGIN
  SELECT store_name INTO store FROM public.users WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, for_admin, type, title, body, meta)
  VALUES (
    NULL, TRUE, 'credit_request_new',
    'New credit request',
    COALESCE(store, 'A partner') || ' has requested ₹' || NEW.amount::TEXT || ' additional credit.',
    jsonb_build_object('request_id', NEW.id, 'user_id', NEW.user_id, 'amount', NEW.amount)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_credit_request_insert ON public.credit_requests;
CREATE TRIGGER on_credit_request_insert
  AFTER INSERT ON public.credit_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_credit_request();

-- ─── Realtime broadcast ─────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_requests;
