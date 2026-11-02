ALTER TABLE public.purchase_items ADD COLUMN tax_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_entries ADD COLUMN tax_total numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.purchase_items.tax_amount IS 'Purchase tax amount for this line = qty * cost * tax_pct / 100; line_total is cost plus this tax';
COMMENT ON COLUMN public.purchase_entries.tax_total IS 'Sum of purchase_items.tax_amount for the entry; total = net base + tax_total';
-- Backfill existing lines from tax_pct so totals stay consistent
UPDATE public.purchase_items SET tax_amount = ROUND(qty * cost * tax_pct / 100, 2) WHERE tax_pct > 0 AND tax_amount = 0;
UPDATE public.purchase_entries e SET tax_total = COALESCE((SELECT SUM(i.tax_amount) FROM public.purchase_items i WHERE i.entry_id = e.id), 0) WHERE e.tax_total = 0;
-- line_total on existing rows becomes cost-inclusive of tax for reporting
UPDATE public.purchase_items SET line_total = qty * cost + tax_amount WHERE line_total = 0;