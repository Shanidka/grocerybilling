
-- SHOP SETTINGS
CREATE TABLE public.shop_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name TEXT NOT NULL DEFAULT 'My Supermarket',
  phone TEXT,
  address TEXT,
  gst_number TEXT,
  upi_id TEXT,
  receipt_footer TEXT DEFAULT 'Thank you for shopping!',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read shop" ON public.shop_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manager write shop" ON public.shop_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER tg_shop_settings_touch BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.shop_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- PRODUCTS: weight pricing
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_by TEXT NOT NULL DEFAULT 'unit' CHECK (sold_by IN ('unit','weight')),
  ADD COLUMN IF NOT EXISTS price_per_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_weight_g NUMERIC(12,2);

-- PURCHASE ENTRIES (stock-in from suppliers)
CREATE TABLE public.purchase_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier TEXT,
  invoice_no TEXT,
  notes TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_entries TO authenticated;
GRANT ALL ON public.purchase_entries TO service_role;
ALTER TABLE public.purchase_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read pe" ON public.purchase_entries FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "mgr write pe" ON public.purchase_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.purchase_entries(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read pi" ON public.purchase_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "mgr write pi" ON public.purchase_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- Increment stock on purchase
CREATE OR REPLACE FUNCTION public.increment_stock_on_purchase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock_qty = stock_qty + NEW.qty WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_purchase_stock AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.increment_stock_on_purchase();

-- STOCK ADJUSTMENTS (manual +/-)
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  delta NUMERIC(12,3) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read sa" ON public.stock_adjustments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "mgr write sa" ON public.stock_adjustments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.apply_stock_adjustment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products SET stock_qty = stock_qty + NEW.delta WHERE id = NEW.product_id;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_apply_adjust AFTER INSERT ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_adjustment();

-- DAMAGED PRODUCTS
CREATE TABLE public.damaged_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty NUMERIC(12,3) NOT NULL,
  reason TEXT,
  loss_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_products TO authenticated;
GRANT ALL ON public.damaged_products TO service_role;
ALTER TABLE public.damaged_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read dp" ON public.damaged_products FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "mgr write dp" ON public.damaged_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.decrement_stock_damage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products SET stock_qty = stock_qty - NEW.qty WHERE id = NEW.product_id;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_damage_stock AFTER INSERT ON public.damaged_products
  FOR EACH ROW EXECUTE FUNCTION public.decrement_stock_damage();

-- RETURNS
CREATE TABLE public.product_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty NUMERIC(12,3) NOT NULL,
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  restock BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_returns TO authenticated;
GRANT ALL ON public.product_returns TO service_role;
ALTER TABLE public.product_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read pr" ON public.product_returns FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write pr" ON public.product_returns FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "mgr modify pr" ON public.product_returns FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "mgr del pr" ON public.product_returns FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.restock_on_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.restock THEN
    UPDATE public.products SET stock_qty = stock_qty + NEW.qty WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_return_restock AFTER INSERT ON public.product_returns
  FOR EACH ROW EXECUTE FUNCTION public.restock_on_return();
