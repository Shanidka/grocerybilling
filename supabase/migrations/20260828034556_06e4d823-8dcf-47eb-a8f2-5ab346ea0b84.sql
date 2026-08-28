CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'supermarket',
  phone text,
  address text,
  gst_number text,
  upi_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read stores" ON public.stores FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "managers manage stores" ON public.stores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER stores_touch BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.stores (id, name, kind)
VALUES ('11111111-1111-1111-1111-111111111111', 'SHANID STORE', 'supermarket');

ALTER TABLE public.products ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.sales ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.held_bills ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_entries ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

UPDATE public.products SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.sales SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.held_bills SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.customers SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.suppliers SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.expenses SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.purchase_entries SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;
UPDATE public.purchase_orders SET store_id = '11111111-1111-1111-1111-111111111111' WHERE store_id IS NULL;

ALTER TABLE public.products ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.sales ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.held_bills ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.customers ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.suppliers ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.expenses ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.purchase_entries ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.purchase_orders ALTER COLUMN store_id SET DEFAULT '11111111-1111-1111-1111-111111111111';

CREATE INDEX idx_products_store ON public.products(store_id);
CREATE INDEX idx_sales_store ON public.sales(store_id);
CREATE INDEX idx_expenses_store ON public.expenses(store_id);
CREATE INDEX idx_customers_store ON public.customers(store_id);

CREATE TABLE public.shop_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE DEFAULT '11111111-1111-1111-1111-111111111111',
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  doc_number text,
  issued_on date,
  expires_on date,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_documents TO authenticated;
GRANT ALL ON public.shop_documents TO service_role;
ALTER TABLE public.shop_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read documents" ON public.shop_documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert documents" ON public.shop_documents FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "managers update documents" ON public.shop_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR uploaded_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR uploaded_by = auth.uid());
CREATE POLICY "managers delete documents" ON public.shop_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR uploaded_by = auth.uid());
CREATE TRIGGER shop_documents_touch BEFORE UPDATE ON public.shop_documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();