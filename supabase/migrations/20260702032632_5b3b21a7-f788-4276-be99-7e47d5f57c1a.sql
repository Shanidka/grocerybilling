
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_old_sales()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sales WHERE created_at < now() - INTERVAL '18 months';
END $$;

-- Unschedule if exists
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-old-sales-18m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-sales-18m',
  '0 3 * * *',
  $$ SELECT public.cleanup_old_sales(); $$
);
