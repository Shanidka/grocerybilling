
-- Expenses (Money Out)
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  spent_on date NOT NULL DEFAULT current_date,
  payee text,
  payment_mode text NOT NULL DEFAULT 'cash',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read expenses" ON public.expenses FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "mgr write expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER expenses_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_expenses_date ON public.expenses(spent_on DESC);

-- Purchase orders enhancements
CREATE SEQUENCE IF NOT EXISTS public.po_no_seq START 1;
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_at date;

CREATE OR REPLACE FUNCTION public.next_po_no() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'PO-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('public.po_no_seq')::text, 4, '0')
$$;

-- Purchase order items enhancements
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mrp numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS weight_g numeric(12,2);

-- Purchase items (invoice line) enhancements for OCR fields
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS hsn text,
  ADD COLUMN IF NOT EXISTS mrp numeric(12,2),
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total numeric(12,2) NOT NULL DEFAULT 0;

-- Sale items: capture cost at time of sale for profit reporting
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost_at_sale numeric(12,2) NOT NULL DEFAULT 0;

-- Allow the same barcode across multiple product rows (different MRPs)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
