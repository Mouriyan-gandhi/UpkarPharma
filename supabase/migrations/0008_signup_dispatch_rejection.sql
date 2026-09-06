-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0008 — Signup fields, dispatch person, and rejection reasons
--
-- Adds three concerns in one migration since they share the "audit trail"
-- theme:
--   1. Signup captures more context (years_in_business, email_verified).
--   2. Delivery details switch from courier/AWB to a named delivery person
--      + their phone number so the customer can call if something's wrong.
--   3. Rejection reasons on both users (signup denied) and orders (order
--      denied) so admin can explain why AND the customer sees exactly what
--      went wrong instead of a silent "rejected" state.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── users ───────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS years_in_business TEXT,   -- '0-1' | '1-3' | '3-5' | '5-10' | '10+'
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_rejected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id);

-- Signup + login flows treat 'rejected' users as blocked from ordering but
-- allow them to still see WHY (so they can fix + resubmit). Not a hard block
-- from browsing.

-- ─── orders ──────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  -- Delivery contact (replaces courier_name/tracking_id which were AWB-oriented)
  ADD COLUMN IF NOT EXISTS delivery_person_name  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_person_phone TEXT,
  -- Rejection audit trail
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id);

-- Backfill: if any historic order was Rejected without a reason, leave the
-- reason NULL — the field is new, older orders simply don't have one.

-- ─── Refresh policy — allow admins to update these new fields ────────────
-- The existing users_admin_update policy already covers UPDATE with role check,
-- so no policy change needed for the new user columns. Same for orders — the
-- admin RLS policy on orders is table-scoped.
