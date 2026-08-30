
-- 1) damaged_products: insert/read only, no update/delete via API
REVOKE UPDATE, DELETE ON public.damaged_products FROM authenticated;
REVOKE UPDATE, DELETE ON public.damaged_products FROM anon;
CREATE POLICY "deny update dp" ON public.damaged_products FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny delete dp" ON public.damaged_products FOR DELETE TO authenticated USING (false);

-- 2) is_staff broad access: restrict expenses read to admin/manager
DROP POLICY IF EXISTS "staff read expenses" ON public.expenses;
CREATE POLICY "mgr read expenses" ON public.expenses FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 3) suppliers: writes restricted to admin/manager (read stays staff-wide for inventory lookups)
DROP POLICY IF EXISTS "staff write suppliers" ON public.suppliers;
CREATE POLICY "mgr write suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 4) Trigger-only / maintenance SECURITY DEFINER functions: not user-callable
REVOKE EXECUTE ON FUNCTION public.apply_stock_adjustment() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_damage() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restock_on_return() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_stock_on_purchase() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_sales() FROM public, anon, authenticated;

-- 5) Number generators: run as caller (SECURITY INVOKER) with sequence usage granted
GRANT USAGE ON SEQUENCE public.bill_no_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.po_no_seq TO authenticated;
CREATE OR REPLACE FUNCTION public.next_bill_no()
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT 'INV-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.bill_no_seq')::text, 5, '0')
$$;
CREATE OR REPLACE FUNCTION public.next_po_no()
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT 'PO-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('public.po_no_seq')::text, 4, '0')
$$;

-- 6) Role-check helpers stay SECURITY DEFINER (required to avoid RLS recursion) but not for anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM public, anon;
