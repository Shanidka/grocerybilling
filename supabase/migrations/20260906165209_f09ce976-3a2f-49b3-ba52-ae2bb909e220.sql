CREATE TABLE public.credit_collections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES public.stores(id),
  sale_id uuid REFERENCES public.sales(id),
  customer_key text NOT NULL,
  customer_name text,
  customer_phone text,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL DEFAULT 'cash',
  notes text,
  collected_by uuid REFERENCES auth.users(id),
  collected_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_collections TO authenticated;
GRANT ALL ON public.credit_collections TO service_role;

ALTER TABLE public.credit_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view credit collections" ON public.credit_collections
FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can add credit collections" ON public.credit_collections
FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND collected_by = auth.uid());

CREATE POLICY "Managers can update credit collections" ON public.credit_collections
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete credit collections" ON public.credit_collections
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX credit_collections_store_key_idx ON public.credit_collections (store_id, customer_key);