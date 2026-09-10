-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0010 — Atomic stock decrement RPC
--
-- Two concurrent orders for the last unit of a product previously both saw
-- stock=1 (read), decided qty was fine, and both wrote stock=0 — overselling.
-- This RPC does the decrement inside a single UPDATE with a WHERE guard so
-- at most one of the two wins. Returns the new stock; NULL means the
-- decrement was rejected (insufficient stock).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decrement_product_stock(
  p_id INTEGER,
  p_qty INTEGER
) RETURNS INTEGER AS $$
DECLARE
  new_stock INTEGER;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;
  UPDATE public.products
     SET stock = stock - p_qty
   WHERE id = p_id
     AND stock >= p_qty
   RETURNING stock INTO new_stock;
  RETURN new_stock;    -- NULL if the WHERE failed (insufficient stock)
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.decrement_product_stock(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(INTEGER, INTEGER) TO service_role;
