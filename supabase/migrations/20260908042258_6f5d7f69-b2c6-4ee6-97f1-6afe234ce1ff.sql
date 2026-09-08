ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_executive';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_keeper';

CREATE TABLE public.app_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  base_role text NOT NULL DEFAULT 'cashier',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_roles TO authenticated;
GRANT ALL ON public.app_roles TO service_role;
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read designations" ON public.app_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage designations" ON public.app_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER app_roles_touch BEFORE UPDATE ON public.app_roles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL REFERENCES public.app_roles(key) ON DELETE CASCADE,
  page text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_key, page)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read access rules" ON public.role_permissions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage access rules" ON public.role_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER role_permissions_touch BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role_key text;

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id),
  area text NOT NULL,
  action text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  details jsonb,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_created_idx ON public.activity_logs (created_at DESC);
CREATE INDEX activity_logs_area_idx ON public.activity_logs (area);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can write their own log entries" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id AND public.is_staff(auth.uid()));
CREATE POLICY "Admins and managers read logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));