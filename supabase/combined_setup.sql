-- =======================================================
-- FULL SCHEMA SETUP — run this once in Supabase SQL Editor
-- =======================================================

-- ── 1. Roles & core types ──────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ── 2. Certificate status ──────────────────────────────
CREATE TYPE public.certificate_status AS ENUM ('valid', 'revoked');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  programme TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE,
  status public.certificate_status NOT NULL DEFAULT 'valid',
  issuer_name TEXT NOT NULL,
  issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX certificates_certificate_id_idx ON public.certificates (certificate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificates TO authenticated;
GRANT SELECT ON public.certificates TO anon;
GRANT ALL ON public.certificates TO service_role;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view certificates for verification"
  ON public.certificates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert certificates"
  ON public.certificates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update certificates"
  ON public.certificates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete certificates"
  ON public.certificates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bootstrap: first user automatically becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user_admin_bootstrap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created_bootstrap_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin_bootstrap();

-- ── 3. Lock down function permissions ─────────────────
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_admin_bootstrap() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- ── 4. Courses ─────────────────────────────────────────
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  prefix text NOT NULL UNIQUE,
  description text,
  duration_text text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT ON public.courses TO anon;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active courses" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Admins can insert courses" ON public.courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update courses" ON public.courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete courses" ON public.courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 5. Students ────────────────────────────────────────
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  national_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX students_email_idx ON public.students (lower(email));
CREATE INDEX students_name_idx ON public.students (lower(full_name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view students" ON public.students FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert students" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update students" ON public.students FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete students" ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. Enrolments ──────────────────────────────────────
CREATE TYPE public.enrolment_status AS ENUM ('enrolled','in_progress','completed','certified');

CREATE TABLE public.enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  status public.enrolment_status NOT NULL DEFAULT 'enrolled',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  certificate_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

CREATE INDEX enrolments_status_idx ON public.enrolments (status);
CREATE INDEX enrolments_student_idx ON public.enrolments (student_id);
CREATE INDEX enrolments_course_idx ON public.enrolments (course_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrolments TO authenticated;
GRANT ALL ON public.enrolments TO service_role;
ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view enrolments" ON public.enrolments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert enrolments" ON public.enrolments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update enrolments" ON public.enrolments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete enrolments" ON public.enrolments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER enrolments_updated_at
  BEFORE UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend certificates with course/student links
ALTER TABLE public.certificates
  ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN recipient_email text,
  ADD COLUMN email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN email_sent_at timestamptz,
  ADD COLUMN email_last_error text,
  ADD COLUMN email_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX certificates_course_idx ON public.certificates (course_id);
CREATE INDEX certificates_student_idx ON public.certificates (student_id);
CREATE INDEX certificates_email_status_idx ON public.certificates (email_status);

ALTER TABLE public.enrolments
  ADD CONSTRAINT enrolments_certificate_fk
  FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE SET NULL;

-- Seed courses
INSERT INTO public.courses (code, name, prefix, description) VALUES
  ('WEB-DEV', 'Web Development', 'WEB', 'Full-stack web development programme'),
  ('DATA-ANL', 'Data Analytics', 'DATA', 'Data analysis & visualization'),
  ('PM-FUND', 'Project Management', 'PM', 'Project management fundamentals')
ON CONFLICT (code) DO NOTHING;

-- ── 7. Storage buckets & policies ─────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES
  ('branding', 'branding', false),
  ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read branding"
  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'branding');
CREATE POLICY "Admins can upload branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update branding"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete branding"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read certificates"
  ON storage.objects FOR SELECT USING (bucket_id = 'certificates');
CREATE POLICY "Admins can upload certificates"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update certificate files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete certificate files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));

-- ── 8. Org settings ────────────────────────────────────
CREATE TABLE public.org_settings (
  id BOOLEAN NOT NULL DEFAULT TRUE PRIMARY KEY CHECK (id = TRUE),
  org_name TEXT NOT NULL DEFAULT 'Your Organization',
  org_prefix TEXT NOT NULL DEFAULT 'ORG',
  signatory1_name TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory1_title TEXT NOT NULL DEFAULT 'Director',
  signatory2_name TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory2_title TEXT NOT NULL DEFAULT 'Programme Lead',
  template_layout JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read org settings" ON public.org_settings FOR SELECT USING (true);
CREATE POLICY "Admins can insert org settings" ON public.org_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update org settings" ON public.org_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.org_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- ── 9. Student & course extended fields ───────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'non_unza'
    CHECK (category IN ('unza','non_unza')),
  ADD COLUMN IF NOT EXISTS unza_student_id text,
  ADD COLUMN IF NOT EXISTS pii_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pii_consent_source text;

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_unza_id_required;
ALTER TABLE public.students ADD CONSTRAINT students_unza_id_required CHECK (
  (category = 'unza' AND unza_student_id IS NOT NULL AND length(trim(unza_student_id)) > 0)
  OR (category = 'non_unza')
);

CREATE UNIQUE INDEX IF NOT EXISTS students_unza_student_id_uniq
  ON public.students (lower(unza_student_id)) WHERE unza_student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_national_id_uniq
  ON public.students (lower(national_id)) WHERE national_id IS NOT NULL;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'short_course'
    CHECK (category IN ('self_paced','short_course','special_schedule','professional_diploma')),
  ADD COLUMN IF NOT EXISTS fee_unza numeric(10,2),
  ADD COLUMN IF NOT EXISTS fee_non_unza numeric(10,2),
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS time_slot text,
  ADD COLUMN IF NOT EXISTS mode text
    CHECK (mode IS NULL OR mode IN ('self_paced','interactive','special_schedule','blended'));

ALTER TABLE public.enrolments
  ADD COLUMN IF NOT EXISTS fee_charged numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','waived','free'));

CREATE TABLE IF NOT EXISTS public.student_access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid REFERENCES public.students(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (action IN ('view','create','update','delete','export')),
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.student_access_log TO authenticated;
GRANT ALL ON public.student_access_log TO service_role;
ALTER TABLE public.student_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access log" ON public.student_access_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can append access log" ON public.student_access_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE INDEX IF NOT EXISTS student_access_log_student_idx ON public.student_access_log (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS student_access_log_actor_idx ON public.student_access_log (actor_id, created_at DESC);

-- ── 10. Student metadata JSONB ─────────────────────────
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE INDEX IF NOT EXISTS students_metadata_gin ON public.students USING gin (metadata);

-- ── 11. Certificate codes, counters & signing ──────────
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS certificate_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS signed_payload JSONB,
  ADD COLUMN IF NOT EXISTS signature TEXT;

CREATE INDEX IF NOT EXISTS certificates_code_idx ON public.certificates (certificate_code);

CREATE TABLE IF NOT EXISTS public.certificate_counters (
  course_id UUID PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.certificate_counters TO service_role;
ALTER TABLE public.certificate_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages counters"
  ON public.certificate_counters USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_certificate_counter(p_course_id UUID)
RETURNS TABLE (last_number INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.certificate_counters (course_id, last_number)
    VALUES (p_course_id, 1)
  ON CONFLICT (course_id) DO UPDATE
    SET last_number = public.certificate_counters.last_number + 1,
        updated_at  = now();
  RETURN QUERY SELECT c.last_number FROM public.certificate_counters c WHERE c.course_id = p_course_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.increment_certificate_counter(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_certificate_counter(UUID) TO service_role;

-- ── 12. User settings (force password change on first login)
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON public.user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can clear own must_change_password"
  ON public.user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND must_change_password = FALSE);

GRANT SELECT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
