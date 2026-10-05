-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0011 — products.show_photo
--
-- Lets admin opt-in to showing a product image on the customer side. Default
-- FALSE because the current 203 Derma catalog has no real photos — we've
-- been rendering stock placeholders which look worse than nothing. New
-- products also default FALSE; admin flips the toggle only once they've
-- uploaded a real photo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS show_photo BOOLEAN NOT NULL DEFAULT FALSE;

-- Explicitly set FALSE on everything that exists (including rows inserted
-- before the DEFAULT was defined — belt + braces).
UPDATE public.products
   SET show_photo = FALSE
 WHERE show_photo IS NULL;
