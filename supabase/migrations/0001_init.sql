-- ═══════════════════════════════════════════════════════════════════════════
-- UPKEM Pharma — Postgres schema (Supabase)
--
-- Design notes:
--   * Users are linked 1:1 to auth.users via UUID.
--   * All money in NUMERIC(12,2). No REAL/FLOAT for financial data.
--   * order_items snapshots product fields (name, packing, hsn, gst%, mrp)
--     so historical invoices don't change if the product master is later edited.
--   * invoices snapshots buyer info as JSONB so old invoices stay valid even
--     if the pharmacy updates their address/GST later.
--   * OTP + sessions + admin_sessions from the old schema are dropped —
--     Supabase Auth handles all of that.
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";           -- gen_random_uuid()

-- ─── users (linked to auth.users) ─────────────────────────────────────────────
-- One row per pharmacy partner. `id` mirrors the Supabase Auth user id.
CREATE TABLE IF NOT EXISTS public.users (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone               TEXT UNIQUE NOT NULL,
  store_name          TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  is_approved         BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked          BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason      TEXT,
  credit_balance      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_limit        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  expo_push_token     TEXT,
  -- Registration fields captured during signup / profile completion
  drug_license        TEXT,
  gst_number          TEXT,
  registration_number TEXT,
  address             TEXT,
  email               TEXT,
  user_type           TEXT,
  zone                TEXT,
  city                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_phone_idx  ON public.users (phone);
CREATE INDEX IF NOT EXISTS users_role_idx   ON public.users (role);

-- ─── products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                     BIGSERIAL PRIMARY KEY,
  name                   TEXT NOT NULL,
  code                   TEXT,              -- SKU code from catalog
  company                TEXT,
  manufacturer           TEXT,              -- short mfr code shown on invoice (e.g. "VAKU")
  category               TEXT,
  body_system            TEXT,
  drug_name              TEXT,              -- composition / molecule
  composition            TEXT,              -- long form composition text
  description            TEXT,
  packing                TEXT,              -- e.g. "10*1*10", "20GM"
  hsn                    TEXT,              -- HSN code (invoice-required)
  gst_percent            NUMERIC(5, 2),     -- e.g. 5, 12, 18
  price                  NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- legacy PTR (kept for compat)
  price_ptr              NUMERIC(12, 2),
  pts                    NUMERIC(12, 2),
  pur_rate               NUMERIC(12, 2),
  sal_rate               NUMERIC(12, 2),
  mrp                    NUMERIC(12, 2),
  stock                  INTEGER NOT NULL DEFAULT 0,
  stock_status           TEXT,
  distributor            TEXT,
  supplier               TEXT,
  segregation            TEXT,
  matched_brochure_page  INTEGER,
  image_url              TEXT,              -- legacy single image
  images                 TEXT[] DEFAULT '{}',  -- multi-image gallery
  short_expiry           BOOLEAN NOT NULL DEFAULT FALSE,
  discount_percent       NUMERIC(5, 2) DEFAULT 0,
  expiry_date            TEXT,              -- default expiry (per-stock-lot lives on order_items)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_name_idx      ON public.products (name);
CREATE INDEX IF NOT EXISTS products_category_idx  ON public.products (category);
CREATE INDEX IF NOT EXISTS products_code_idx      ON public.products (code);
CREATE INDEX IF NOT EXISTS products_stock_idx     ON public.products (stock);

-- ─── orders ──────────────────────────────────────────────────────────────────
-- Keep TEXT id to preserve existing "ORD123456" / "UPK-2725" formats.
CREATE TABLE IF NOT EXISTS public.orders (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_phone     TEXT NOT NULL,      -- denormalized for quick queries + admin display
  store_name     TEXT NOT NULL,      -- snapshot at order time
  status         TEXT NOT NULL DEFAULT 'Invoicing',
  subtotal       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gst            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scheme_code    TEXT,
  courier_name   TEXT,
  tracking_id    TEXT,
  date           TEXT NOT NULL,      -- display date (as in old schema, e.g. "15/04/2026")
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_user_id_idx     ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_user_phone_idx  ON public.orders (user_phone);
CREATE INDEX IF NOT EXISTS orders_status_idx      ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx  ON public.orders (created_at DESC);

-- ─── order_items (with invoice snapshot fields) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id                BIGSERIAL PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id        BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  -- Snapshots (never change even if product master is later edited)
  product_name      TEXT NOT NULL,
  packing           TEXT,
  hsn               TEXT,
  gst_percent       NUMERIC(5, 2),
  mrp               NUMERIC(12, 2),
  mfr               TEXT,
  -- Per-stock-lot (filled at Invoicing stage by admin)
  batch_no          TEXT,
  expiry_date       TEXT,
  -- Quantities + pricing
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  free_quantity     INTEGER NOT NULL DEFAULT 0,
  price_at_time     NUMERIC(12, 2) NOT NULL,
  discount_percent  NUMERIC(5, 2) NOT NULL DEFAULT 0,
  line_total        NUMERIC(12, 2) GENERATED ALWAYS AS
    (ROUND(quantity * price_at_time * (1 - discount_percent / 100.0), 2)) STORED
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx    ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx  ON public.order_items (product_id);

-- ─── invoices (proper snapshot for the GST invoice) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id               BIGSERIAL PRIMARY KEY,
  invoice_no       TEXT UNIQUE NOT NULL,       -- UPD145, UPD146, ...
  order_id         TEXT NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id),
  status           TEXT NOT NULL DEFAULT 'Draft'
                     CHECK (status IN ('Draft', 'Approved', 'Sent', 'Cancelled')),
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE,
  buyer_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { store_name, phone, address, city, drug_license, gst_number }
  subtotal         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cgst             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sgst             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  freight          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  round_off        NUMERIC(6, 2)  NOT NULL DEFAULT 0,
  net_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_in_words  TEXT,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES public.users(id),
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoices_order_id_idx  ON public.invoices (order_id);
CREATE INDEX IF NOT EXISTS invoices_user_id_idx   ON public.invoices (user_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx    ON public.invoices (status);

-- ─── invoice_counter (single row — next UPD number) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_counter (
  id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_number  INTEGER NOT NULL DEFAULT 145        -- continues from sample UPD144
);
INSERT INTO public.invoice_counter (id, next_number) VALUES (1, 145)
  ON CONFLICT (id) DO NOTHING;

-- Atomic invoice number allocation. Returns the next UPD_____ number.
CREATE OR REPLACE FUNCTION public.next_invoice_no()
RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.invoice_counter
     SET next_number = next_number + 1
   WHERE id = 1
  RETURNING next_number - 1 INTO n;
  RETURN 'UPD' || LPAD(n::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ─── schemes (promotional codes) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schemes (
  id                BIGSERIAL PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT,
  code              TEXT UNIQUE NOT NULL,
  scheme_type       TEXT NOT NULL DEFAULT 'Discount'
                      CHECK (scheme_type IN ('Discount', 'Flat')),
  discount_percent  NUMERIC(5, 2),
  flat_discount     NUMERIC(12, 2),
  min_order_value   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_discount      NUMERIC(12, 2),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  usage_limit       INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  per_user_limit    INTEGER NOT NULL DEFAULT 1,
  times_used        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS schemes_code_idx    ON public.schemes (code);
CREATE INDEX IF NOT EXISTS schemes_active_idx  ON public.schemes (is_active) WHERE is_active;

-- ─── notifications (new — for both customer + admin) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,  -- NULL = for all admins
  for_admin   BOOLEAN NOT NULL DEFAULT FALSE,
  type        TEXT NOT NULL,
    -- 'order_placed' | 'invoice_ready' | 'order_packaged' | 'order_dispatched'
    -- 'account_approved' | 'account_blocked' | 'credit_updated' | 'signup_pending'
  title       TEXT NOT NULL,
  body        TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx    ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_admin_idx      ON public.notifications (for_admin, created_at DESC) WHERE for_admin;
CREATE INDEX IF NOT EXISTS notifications_unread_idx     ON public.notifications (user_id) WHERE NOT read;

-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers: keep updated_at in sync
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','products','orders','invoices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-create public.users row when a new auth.users row is inserted
-- (Supabase Auth signup / OTP verify creates auth.users; we mirror the row.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, phone, store_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'store_name', 'New Partner')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper: is the current caller an admin?
-- Used by RLS policies below.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND NOT is_blocked
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- Row-Level Security
--   * Enabled on every user-facing table.
--   * Owners read/write their own rows; admins read/write everything;
--     products + schemes are readable to any authenticated user.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;

-- ── users ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_self_select   ON public.users;
DROP POLICY IF EXISTS users_admin_select  ON public.users;
DROP POLICY IF EXISTS users_self_update   ON public.users;
DROP POLICY IF EXISTS users_admin_update  ON public.users;

CREATE POLICY users_self_select ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_admin_select ON public.users
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())        -- can't change own role
    AND is_approved = (SELECT is_approved FROM public.users WHERE id = auth.uid())
    AND is_blocked  = (SELECT is_blocked  FROM public.users WHERE id = auth.uid())
    AND credit_balance = (SELECT credit_balance FROM public.users WHERE id = auth.uid())
    AND credit_limit   = (SELECT credit_limit   FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY users_admin_update ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── products ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS products_read_all      ON public.products;
DROP POLICY IF EXISTS products_admin_write   ON public.products;

CREATE POLICY products_read_all ON public.products
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY products_admin_write ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── orders ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS orders_self_select   ON public.orders;
DROP POLICY IF EXISTS orders_admin_select  ON public.orders;
DROP POLICY IF EXISTS orders_self_insert   ON public.orders;
DROP POLICY IF EXISTS orders_admin_update  ON public.orders;

CREATE POLICY orders_self_select ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY orders_admin_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY orders_self_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY orders_admin_update ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── order_items ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS order_items_self_select   ON public.order_items;
DROP POLICY IF EXISTS order_items_admin_select  ON public.order_items;
DROP POLICY IF EXISTS order_items_self_insert   ON public.order_items;
DROP POLICY IF EXISTS order_items_admin_update  ON public.order_items;

CREATE POLICY order_items_self_select ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY order_items_admin_select ON public.order_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY order_items_self_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY order_items_admin_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── invoices ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS invoices_self_select   ON public.invoices;
DROP POLICY IF EXISTS invoices_admin_all     ON public.invoices;

CREATE POLICY invoices_self_select ON public.invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY invoices_admin_all ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── schemes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS schemes_read_all     ON public.schemes;
DROP POLICY IF EXISTS schemes_admin_write  ON public.schemes;

CREATE POLICY schemes_read_all ON public.schemes
  FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY schemes_admin_write ON public.schemes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── notifications ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_self_select    ON public.notifications;
DROP POLICY IF EXISTS notifications_admin_select   ON public.notifications;
DROP POLICY IF EXISTS notifications_self_update    ON public.notifications;
DROP POLICY IF EXISTS notifications_admin_all      ON public.notifications;

CREATE POLICY notifications_self_select ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_admin_select ON public.notifications
  FOR SELECT TO authenticated
  USING (for_admin AND public.is_admin());

CREATE POLICY notifications_self_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_admin_all ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime — enable for tables the client subscribes to
-- ═══════════════════════════════════════════════════════════════════════════
-- Broadcasts INSERT/UPDATE/DELETE events over WebSocket to subscribed clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
