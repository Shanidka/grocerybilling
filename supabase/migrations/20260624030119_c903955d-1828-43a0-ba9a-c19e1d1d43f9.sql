
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'cashier');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read all auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto profile + first user = admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cashier');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories read auth" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories manage admin/manager" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  margin_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_products_name ON public.products USING GIN (to_tsvector('simple', name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read auth" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products manage admin/manager" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bill number sequence
CREATE SEQUENCE public.bill_no_seq START 1001;

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_no TEXT NOT NULL UNIQUE DEFAULT ('B' || lpad(nextval('public.bill_no_seq')::text, 6, '0')),
  cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  bill_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  customer_name TEXT,
  customer_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales read auth" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales insert auth" ON public.sales FOR INSERT TO authenticated WITH CHECK (cashier_id = auth.uid());
CREATE POLICY "sales update admin/manager" ON public.sales FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  tax_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
GRANT SELECT, INSERT ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items read auth" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sale_items insert auth" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.cashier_id = auth.uid()));

-- Auto-decrement stock on sale item insert
CREATE OR REPLACE FUNCTION public.decrement_stock() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET stock_qty = stock_qty - NEW.qty WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_decrement_stock AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.decrement_stock();
