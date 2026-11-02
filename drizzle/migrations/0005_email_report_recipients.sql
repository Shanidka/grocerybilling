CREATE TABLE public.email_report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  daily boolean NOT NULL DEFAULT false,
  weekly boolean NOT NULL DEFAULT false,
  monthly boolean NOT NULL DEFAULT false,
  yearly boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_report_recipients_email_key ON public.email_report_recipients (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_report_recipients TO authenticated;
GRANT ALL ON public.email_report_recipients TO service_role;
ALTER TABLE public.email_report_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage email report recipients" ON public.email_report_recipients FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));