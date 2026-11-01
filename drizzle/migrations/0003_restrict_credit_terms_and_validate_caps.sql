CREATE OR REPLACE FUNCTION public.guard_credit_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
   IF TG_OP='INSERT' THEN
     IF NEW.credit_limit IS NOT NULL OR NEW.credit_days<>30 THEN RAISE EXCEPTION 'Only managers can change credit terms'; END IF;
   ELSIF NEW.credit_limit IS DISTINCT FROM OLD.credit_limit OR NEW.credit_days IS DISTINCT FROM OLD.credit_days THEN RAISE EXCEPTION 'Only managers can change credit terms';
   END IF;
 END IF;
 IF NEW.credit_limit::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Enter a finite credit limit'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_customer_credit_terms BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_credit_terms();
REVOKE ALL ON FUNCTION public.guard_customer_credit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_credit_terms() FROM PUBLIC, anon, authenticated;