-- ═══════════════════════════════════════════════════════════════════════════
-- Search + sort indexes for the customer catalog.
--
-- Without these, every /api/shop/products call does a seq scan of the
-- products table (5k+ rows). ILIKE '%q%' can't use plain B-tree indexes,
-- so pg_trgm GIN indexes are the right tool. The plain B-tree on `name`
-- helps the default ORDER BY name.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes — support ILIKE %q% without a full seq scan.
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_drug_name_trgm_idx
  ON public.products USING gin (drug_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_company_trgm_idx
  ON public.products USING gin (company gin_trgm_ops);

-- Default ORDER BY name, ascending. B-tree is fine for pagination.
CREATE INDEX IF NOT EXISTS products_name_idx
  ON public.products (name);

-- Common filters.
CREATE INDEX IF NOT EXISTS products_category_idx
  ON public.products (category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_short_expiry_idx
  ON public.products (short_expiry)
  WHERE short_expiry = TRUE;

-- Refresh planner stats so it picks up the new indexes immediately.
ANALYZE public.products;
