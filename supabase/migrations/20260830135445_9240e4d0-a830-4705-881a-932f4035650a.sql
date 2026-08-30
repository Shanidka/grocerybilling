-- 1) Lock down SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.apply_stock_adjustment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_damage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_stock_on_purchase() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restock_on_return() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_sales() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_bill_no() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_po_no() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_bill_no() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_po_no() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_sales() TO service_role;

-- 2) Explicit deny policies for sale_items / purchase_items modification
DROP POLICY IF EXISTS "sale_items no update" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items no delete" ON public.sale_items;
CREATE POLICY "sale_items no update" ON public.sale_items FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "sale_items no delete" ON public.sale_items FOR DELETE TO authenticated, anon USING (false);
REVOKE UPDATE, DELETE ON public.sale_items FROM authenticated, anon;

DROP POLICY IF EXISTS "purchase_items no update" ON public.purchase_items;
DROP POLICY IF EXISTS "purchase_items no delete" ON public.purchase_items;
CREATE POLICY "purchase_items no update" ON public.purchase_items FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "purchase_items no delete" ON public.purchase_items FOR DELETE TO authenticated, anon USING (false);

-- 3) Prevent self-assignment of roles: admin-only writes, explicit deny otherwise
DROP POLICY IF EXISTS "user_roles admin insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles admin update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles admin delete" ON public.user_roles;
CREATE POLICY "user_roles admin insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;