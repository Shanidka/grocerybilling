
-- Per-employee store access
CREATE TABLE public.staff_store_scope (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  all_stores boolean NOT NULL DEFAULT true,
  store_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_store_scope TO authenticated;
GRANT ALL ON public.staff_store_scope TO service_role;
ALTER TABLE public.staff_store_scope ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scope self or mgr read" ON public.staff_store_scope FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.can_access_store(_uid uuid, _store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _store IS NULL
    OR has_role(_uid,'admin')
    OR NOT EXISTS (SELECT 1 FROM staff_store_scope WHERE user_id = _uid)
    OR EXISTS (SELECT 1 FROM staff_store_scope WHERE user_id = _uid AND (all_stores OR _store = ANY(store_ids)))
$$;

DROP POLICY "staff read stores" ON public.stores;
CREATE POLICY "staff read stores" ON public.stores FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND can_access_store(auth.uid(), id));
DROP POLICY "staff read products" ON public.products;
CREATE POLICY "staff read products" ON public.products FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND can_access_store(auth.uid(), store_id));
DROP POLICY "staff read sales" ON public.sales;
CREATE POLICY "staff read sales" ON public.sales FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND can_access_store(auth.uid(), store_id));
DROP POLICY "cashier insert sales" ON public.sales;
CREATE POLICY "cashier insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cashier_id AND is_staff(auth.uid()) AND can_access_store(auth.uid(), store_id));
DROP POLICY "staff read customers" ON public.customers;
CREATE POLICY "staff read customers" ON public.customers FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND can_access_store(auth.uid(), store_id));

-- Weighted average buying price (selling price untouched)
ALTER TABLE public.products ADD COLUMN avg_cost numeric;
CREATE OR REPLACE FUNCTION public.update_avg_cost_on_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.qty > 0 THEN
    UPDATE products SET avg_cost =
      (GREATEST(stock_qty,0) * COALESCE(avg_cost, NULLIF(purchase_price,0), NEW.cost) + NEW.qty * NEW.cost)
      / NULLIF(GREATEST(stock_qty,0) + NEW.qty, 0)
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.update_avg_cost_on_purchase() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tg_purchase_avg_cost BEFORE INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.update_avg_cost_on_purchase();

-- Loyalty
ALTER TABLE public.shop_settings
  ADD COLUMN loyalty_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN loyalty_earn_per numeric NOT NULL DEFAULT 100,
  ADD COLUMN loyalty_point_value numeric NOT NULL DEFAULT 0.1;
ALTER TABLE public.customers
  ADD COLUMN loyalty_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN loyalty_points numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sales
  ADD COLUMN points_earned numeric NOT NULL DEFAULT 0,
  ADD COLUMN points_redeemed numeric NOT NULL DEFAULT 0,
  ADD COLUMN loyalty_discount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id),
  kind text NOT NULL,
  points numeric NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.loyalty_transactions TO authenticated;
GRANT ALL ON public.loyalty_transactions TO service_role;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read loyalty" ON public.loyalty_transactions FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "staff insert loyalty" ON public.loyalty_transactions FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()) AND auth.uid() = created_by AND kind IN ('earn','redeem','adjust'));

CREATE OR REPLACE FUNCTION public.apply_loyalty_txn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'redeem' THEN
    UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - abs(NEW.points)) WHERE id = NEW.customer_id;
  ELSE
    UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + NEW.points) WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_loyalty_txn() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tg_loyalty_apply AFTER INSERT ON public.loyalty_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_loyalty_txn();
