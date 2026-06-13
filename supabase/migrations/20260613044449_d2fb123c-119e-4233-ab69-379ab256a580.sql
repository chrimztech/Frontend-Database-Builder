CREATE TABLE public.org_settings (
  id BOOLEAN NOT NULL DEFAULT TRUE PRIMARY KEY CHECK (id = TRUE),
  org_name TEXT NOT NULL DEFAULT 'Your Organization',
  org_prefix TEXT NOT NULL DEFAULT 'ORG',
  signatory1_name TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory1_title TEXT NOT NULL DEFAULT 'Director',
  signatory2_name TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory2_title TEXT NOT NULL DEFAULT 'Programme Lead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read org settings"
  ON public.org_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert org settings"
  ON public.org_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update org settings"
  ON public.org_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.org_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;