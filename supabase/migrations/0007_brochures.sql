-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0007 — Product brochures (marketing PDFs / catalogs)
--
-- Admin uploads a PDF (e.g. Vakul Lifescience Brochure). Every approved
-- customer sees it in the app under "Brochures" and can view it inline
-- (WebView / native PDF viewer). Deep-link opens the PDF in the OS's
-- default reader if the WebView chokes on it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brochures (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  company     TEXT,        -- "Vakul Lifescience", "Cipla", etc.
  category    TEXT,        -- "Derma", "General", "Seasonal"
  storage_key TEXT NOT NULL, -- key in the 'brochures' storage bucket
  file_url    TEXT NOT NULL, -- public URL (denormalised for quick reads)
  cover_url   TEXT,          -- optional thumbnail
  file_size   BIGINT,        -- bytes
  page_count  INTEGER,       -- optional, set by admin
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brochures_active_idx ON public.brochures (is_active, uploaded_at DESC)
  WHERE is_active = TRUE;

-- RLS: every authenticated user reads active brochures; only admin writes.
ALTER TABLE public.brochures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brochures_read ON public.brochures;
CREATE POLICY brochures_read ON public.brochures
  FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS brochures_admin_write ON public.brochures;
CREATE POLICY brochures_admin_write ON public.brochures
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Broadcast on realtime so mobile picks up new brochures instantly.
ALTER PUBLICATION supabase_realtime ADD TABLE public.brochures;
