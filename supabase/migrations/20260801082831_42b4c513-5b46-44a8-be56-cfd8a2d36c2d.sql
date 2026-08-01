ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_card numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_upi numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_other numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_client_uid_key ON public.sales (client_uid) WHERE client_uid IS NOT NULL;