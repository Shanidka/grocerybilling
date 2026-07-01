-- Backfill profiles and roles for existing users; first user becomes admin
INSERT INTO public.profiles (id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM auth.users
)
INSERT INTO public.user_roles (user_id, role)
SELECT o.id, CASE WHEN o.rn = 1 THEN 'admin'::app_role ELSE 'cashier'::app_role END
FROM ordered o
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = o.id);