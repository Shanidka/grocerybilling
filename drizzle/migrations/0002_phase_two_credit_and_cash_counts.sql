ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT NULL CHECK (credit_limit IS NULL OR credit_limit >= 0), ADD COLUMN IF NOT EXISTS credit_days integer NOT NULL DEFAULT 30 CHECK (credit_days > 0);
ALTER POLICY "staff write customers" ON public.customers USING (public.is_staff(auth.uid()) AND public.can_access_store(auth.uid(),store_id)) WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_store(auth.uid(),store_id));
ALTER POLICY "staff read loyalty" ON public.loyalty_transactions USING (public.is_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id=customer_id AND public.can_access_store(auth.uid(),c.store_id)));
ALTER POLICY "staff insert loyalty" ON public.loyalty_transactions WITH CHECK (public.is_staff(auth.uid()) AND auth.uid()=created_by AND kind IN ('earn','redeem','adjust') AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.store_id IS NOT DISTINCT FROM loyalty_transactions.store_id AND public.can_access_store(auth.uid(),c.store_id)));
CREATE OR REPLACE FUNCTION public.guard_customer_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; cap numeric; used numeric; received numeric;
BEGIN
 IF NEW.credit_amount<=0 THEN RETURN NEW; END IF;
 k=lower(coalesce(nullif(NEW.customer_phone,''),nullif(NEW.customer_name,''),'Walk-in'));
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(NEW.store_id::text,'')||':'||k,0));
 SELECT min(c.credit_limit) INTO cap FROM public.customers c WHERE c.store_id IS NOT DISTINCT FROM NEW.store_id AND lower(coalesce(nullif(c.phone,''),c.name))=k;
 IF cap IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce(sum(s.credit_amount),0) INTO used FROM public.sales s WHERE s.store_id IS NOT DISTINCT FROM NEW.store_id AND s.id<>NEW.id AND lower(coalesce(nullif(s.customer_phone,''),nullif(s.customer_name,''),'Walk-in'))=k;
 SELECT coalesce(sum(c.amount),0) INTO received FROM public.credit_collections c WHERE c.store_id IS NOT DISTINCT FROM NEW.store_id AND c.customer_key=k;
 IF greatest(0,used-received)+NEW.credit_amount>cap+0.01 THEN RAISE EXCEPTION 'Customer credit limit exceeded. Collect outstanding credit or reduce this bill credit.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enforce_customer_credit_limit BEFORE INSERT OR UPDATE OF credit_amount,customer_name,customer_phone,store_id ON public.sales FOR EACH ROW EXECUTE FUNCTION public.guard_customer_credit();
CREATE TABLE public.cash_closings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id), business_date date NOT NULL,
 opening_float numeric NOT NULL CHECK(opening_float>=0), counted_cash numeric NOT NULL CHECK(counted_cash>=0), cash_payouts numeric NOT NULL DEFAULT 0 CHECK(cash_payouts>=0),
 cash_sales numeric NOT NULL, cash_collections numeric NOT NULL, cash_expenses numeric NOT NULL, expected_cash numeric NOT NULL, variance numeric NOT NULL,
 notes text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(store_id,business_date)
);
GRANT SELECT ON public.cash_closings TO authenticated;
GRANT ALL ON public.cash_closings TO service_role;
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read cash closings" ON public.cash_closings FOR SELECT TO authenticated USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND public.can_access_store(auth.uid(),store_id));
CREATE OR REPLACE FUNCTION public.submit_cash_closing(_store uuid,_day date,_opening numeric,_counted numeric,_payouts numeric,_notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cs numeric; cc numeric; ce numeric; expected numeric; close_id uuid; start_at timestamptz; end_at timestamptz;
BEGIN
 IF NOT public.is_staff(auth.uid()) OR NOT public.can_access_store(auth.uid(),_store) THEN RAISE EXCEPTION 'Not permitted'; END IF;
 IF _day IS NULL OR _day>(now() AT TIME ZONE 'Asia/Kolkata')::date OR _opening IS NULL OR _counted IS NULL OR _payouts IS NULL OR _opening<0 OR _counted<0 OR _payouts<0 OR _opening::text IN ('NaN','Infinity') OR _counted::text IN ('NaN','Infinity') OR _payouts::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Enter a valid date and non-negative cash amounts'; END IF;
 start_at=_day::timestamp AT TIME ZONE 'Asia/Kolkata'; end_at=(_day+1)::timestamp AT TIME ZONE 'Asia/Kolkata';
 SELECT coalesce(sum(amount_cash),0) INTO cs FROM public.sales WHERE store_id=_store AND created_at>=start_at AND created_at<end_at AND status IN ('completed','credit');
 SELECT coalesce(sum(amount),0) INTO cc FROM public.credit_collections WHERE store_id=_store AND collected_at>=start_at AND collected_at<end_at AND payment_mode='cash';
 SELECT coalesce(sum(amount),0) INTO ce FROM public.expenses WHERE store_id=_store AND spent_on=_day AND payment_mode='cash';
 expected=_opening+cs+cc-ce-_payouts;
 INSERT INTO public.cash_closings(store_id,business_date,opening_float,counted_cash,cash_payouts,cash_sales,cash_collections,cash_expenses,expected_cash,variance,notes,created_by) VALUES(_store,_day,_opening,_counted,_payouts,cs,cc,ce,expected,_counted-expected,nullif(trim(_notes),''),auth.uid()) RETURNING id INTO close_id;
 RETURN close_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_cash_closing(uuid,date,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_cash_closing(uuid,date,numeric,numeric,numeric,text) TO authenticated,service_role;