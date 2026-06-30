-- =============================================================================
-- UNZA TeLS e-Certificate System — Combined Database Setup
-- Run this ONE file in Supabase SQL Editor to create everything from scratch.
-- Safe to re-run: drops everything first, then rebuilds cleanly.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. CLEAN SLATE  (safe on a fresh project — all DROP ... IF EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────
-- Storage policies
DROP POLICY IF EXISTS "Authenticated users can read branding"  ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload branding"             ON storage.objects;
DROP POLICY IF EXISTS "Admins can update branding"             ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete branding"             ON storage.objects;
DROP POLICY IF EXISTS "Public can read certificates"           ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload certificates"         ON storage.objects;
DROP POLICY IF EXISTS "Admins can update certificate files"    ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete certificate files"    ON storage.objects;

DROP TRIGGER  IF EXISTS on_auth_user_created_bootstrap_admin ON auth.users;
DROP TRIGGER  IF EXISTS sync_certificate_public_code_before_write ON public.certificates;
DROP TRIGGER  IF EXISTS student_access_log_actor_email ON public.student_access_log;
DROP TRIGGER  IF EXISTS update_certificates_updated_at ON public.certificates;
DROP TRIGGER  IF EXISTS students_updated_at ON public.students;
DROP TRIGGER  IF EXISTS courses_updated_at  ON public.courses;
DROP TRIGGER  IF EXISTS enrolments_updated_at ON public.enrolments;
DROP TRIGGER  IF EXISTS trg_org_settings_updated_at ON public.org_settings;

DROP TABLE IF EXISTS public.student_access_log   CASCADE;
DROP TABLE IF EXISTS public.enrolments           CASCADE;
DROP TABLE IF EXISTS public.certificate_counters CASCADE;
DROP TABLE IF EXISTS public.certificates         CASCADE;
DROP TABLE IF EXISTS public.students             CASCADE;
DROP TABLE IF EXISTS public.courses              CASCADE;
DROP TABLE IF EXISTS public.org_settings         CASCADE;
DROP TABLE IF EXISTS public.user_settings        CASCADE;
DROP TABLE IF EXISTS public.user_roles           CASCADE;

DROP VIEW     IF EXISTS public.certificate_public_code_issues;
DROP FUNCTION IF EXISTS public.student_access_log_set_actor_email() CASCADE;
DROP FUNCTION IF EXISTS public.sync_certificate_public_code()       CASCADE;
DROP FUNCTION IF EXISTS public.increment_certificate_counter(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.increment_certificate_counter(UUID)  CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_admin_bootstrap()    CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role)      CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column()           CASCADE;

DROP TYPE IF EXISTS public.enrolment_status   CASCADE;
DROP TYPE IF EXISTS public.certificate_status CASCADE;
DROP TYPE IF EXISTS public.app_role           CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.certificate_status AS ENUM ('valid', 'revoked');
CREATE TYPE public.enrolment_status AS ENUM (
  'enrolled',
  'in_progress',
  'completed',
  'certified'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SHARED TRIGGER FUNCTION  (updated_at)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. USER ROLES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.handle_new_user_admin_bootstrap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_admin_bootstrap() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_bootstrap_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin_bootstrap();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. USER SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.user_settings (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
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
GRANT ALL            ON public.user_settings TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ORG SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.org_settings (
  id               BOOLEAN NOT NULL DEFAULT TRUE PRIMARY KEY CHECK (id = TRUE),
  org_name         TEXT NOT NULL DEFAULT 'Your Organization',
  org_prefix       TEXT NOT NULL DEFAULT 'ORG',
  signatory1_name  TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory1_title TEXT NOT NULL DEFAULT 'Director',
  signatory2_name  TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory2_title TEXT NOT NULL DEFAULT 'Programme Lead',
  template_layout  JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read org settings"     ON public.org_settings FOR SELECT USING (true);
CREATE POLICY "Admins can insert org settings"   ON public.org_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update org settings"   ON public.org_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.org_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. COURSES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.courses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  prefix        text NOT NULL UNIQUE,
  description   text,
  duration_text text,
  active        boolean NOT NULL DEFAULT true,
  category      text NOT NULL DEFAULT 'short_course'
    CHECK (category IN ('self_paced','short_course','special_schedule','professional_diploma')),
  fee_unza      numeric(10,2),
  fee_non_unza  numeric(10,2),
  start_date    date,
  time_slot     text,
  mode          text CHECK (mode IS NULL OR mode IN ('self_paced','interactive','special_schedule','blended')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT ON public.courses TO anon;
GRANT ALL    ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active courses" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Admins can insert courses" ON public.courses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update courses" ON public.courses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete courses"  ON public.courses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.courses (code, name, prefix, description) VALUES
  ('WEB-DEV',  'Web Development',    'WEB',  'Full-stack web development programme'),
  ('DATA-ANL', 'Data Analytics',     'DATA', 'Data analysis & visualization'),
  ('PM-FUND',  'Project Management', 'PM',   'Project management fundamentals')
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. STUDENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.students (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          text NOT NULL,
  email              text,
  phone              text,
  national_id        text,
  notes              text,
  category           text NOT NULL DEFAULT 'non_unza'
    CHECK (category IN ('unza','non_unza')),
  unza_student_id    text,
  pii_consent_at     timestamptz,
  pii_consent_source text,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_unza_id_required CHECK (
    (category = 'unza' AND unza_student_id IS NOT NULL AND length(trim(unza_student_id)) > 0)
    OR (category = 'non_unza')
  )
);

CREATE INDEX students_email_idx    ON public.students (lower(email));
CREATE INDEX students_name_idx     ON public.students (lower(full_name));
CREATE INDEX students_metadata_gin ON public.students USING gin (metadata);
CREATE UNIQUE INDEX students_unza_student_id_uniq ON public.students (lower(unza_student_id)) WHERE unza_student_id IS NOT NULL;
CREATE UNIQUE INDEX students_national_id_uniq     ON public.students (lower(national_id))      WHERE national_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view students"   ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert students" ON public.students FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update students" ON public.students FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete students" ON public.students FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CERTIFICATES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.certificates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id   TEXT NOT NULL UNIQUE,
  certificate_code TEXT UNIQUE,
  recipient_name   TEXT NOT NULL,
  recipient_email  TEXT,
  programme        TEXT NOT NULL,
  issue_date       DATE NOT NULL,
  expiry_date      DATE,
  status           public.certificate_status NOT NULL DEFAULT 'valid',
  issuer_name      TEXT NOT NULL,
  issued_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id        uuid REFERENCES public.courses(id)  ON DELETE SET NULL,
  student_id       uuid REFERENCES public.students(id) ON DELETE SET NULL,
  national_id      TEXT,
  email_status     TEXT NOT NULL DEFAULT 'not_sent',
  email_sent_at    TIMESTAMPTZ,
  email_last_error TEXT,
  email_attempts   INTEGER NOT NULL DEFAULT 0,
  signed_payload   JSONB,
  signature        TEXT,
  revoked_at       TIMESTAMPTZ,
  revoke_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT certificates_public_code_format_chk
    CHECK (certificate_code ~ '^[A-Z0-9]{6,24}$' AND certificate_id = certificate_code)
    NOT VALID
);

CREATE INDEX certificates_certificate_id_idx     ON public.certificates (certificate_id);
CREATE INDEX certificates_code_idx               ON public.certificates (certificate_code);
CREATE INDEX certificates_course_idx             ON public.certificates (course_id);
CREATE INDEX certificates_student_idx            ON public.certificates (student_id);
CREATE INDEX certificates_email_status_idx       ON public.certificates (email_status);
CREATE INDEX certificates_public_code_lookup_idx ON public.certificates (certificate_code, certificate_id);
CREATE UNIQUE INDEX certificates_student_course_uniq
  ON public.certificates (student_id, course_id)
  WHERE student_id IS NOT NULL AND course_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificates TO authenticated;
GRANT SELECT ON public.certificates TO anon;
GRANT ALL    ON public.certificates TO service_role;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view certificates for verification" ON public.certificates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert certificates" ON public.certificates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update certificates" ON public.certificates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete certificates" ON public.certificates FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_certificate_public_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.certificate_code := upper(regexp_replace(coalesce(NEW.certificate_code, NEW.certificate_id), '[^A-Za-z0-9]', '', 'g'));
  NEW.certificate_id := NEW.certificate_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_certificate_public_code_before_write
  BEFORE INSERT OR UPDATE OF certificate_id, certificate_code
  ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.sync_certificate_public_code();

CREATE OR REPLACE VIEW public.certificate_public_code_issues AS
SELECT id, certificate_id, certificate_code, created_at,
  CASE
    WHEN certificate_code IS NULL THEN 'missing_certificate_code'
    WHEN certificate_id IS DISTINCT FROM certificate_code THEN 'id_code_mismatch'
    WHEN certificate_code !~ '^[A-Z0-9]{6,24}$' THEN 'invalid_code_format'
    ELSE 'unknown'
  END AS issue
FROM public.certificates
WHERE certificate_code IS NULL
   OR certificate_id IS DISTINCT FROM certificate_code
   OR certificate_code !~ '^[A-Z0-9]{6,24}$';

GRANT SELECT ON public.certificate_public_code_issues TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CERTIFICATE COUNTERS  (per course, per year)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.certificate_counters (
  course_id   UUID    NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  year_issued INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, year_issued)
);

GRANT ALL ON public.certificate_counters TO service_role;
ALTER TABLE public.certificate_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages counters" ON public.certificate_counters USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_certificate_counter(
  p_course_id UUID,
  p_year      INTEGER DEFAULT 0
)
RETURNS TABLE (last_number INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year INTEGER;
BEGIN
  v_year := CASE WHEN p_year = 0 THEN EXTRACT(YEAR FROM now())::INTEGER ELSE p_year END;
  INSERT INTO public.certificate_counters (course_id, last_number, year_issued)
    VALUES (p_course_id, 1, v_year)
  ON CONFLICT (course_id, year_issued) DO UPDATE
    SET last_number = public.certificate_counters.last_number + 1,
        updated_at  = now();
  RETURN QUERY
    SELECT c.last_number FROM public.certificate_counters c
    WHERE c.course_id = p_course_id AND c.year_issued = v_year;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_certificate_counter(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_certificate_counter(UUID, INTEGER) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ENROLMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.enrolments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.students(id)     ON DELETE CASCADE,
  course_id      uuid NOT NULL REFERENCES public.courses(id)      ON DELETE RESTRICT,
  certificate_id uuid          REFERENCES public.certificates(id) ON DELETE SET NULL,
  status         public.enrolment_status NOT NULL DEFAULT 'enrolled',
  fee_charged    numeric(10,2),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','waived','free')),
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

CREATE INDEX enrolments_status_idx  ON public.enrolments (status);
CREATE INDEX enrolments_student_idx ON public.enrolments (student_id);
CREATE INDEX enrolments_course_idx  ON public.enrolments (course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrolments TO authenticated;
GRANT ALL ON public.enrolments TO service_role;
ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view enrolments"   ON public.enrolments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert enrolments" ON public.enrolments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update enrolments" ON public.enrolments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete enrolments" ON public.enrolments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER enrolments_updated_at
  BEFORE UPDATE ON public.enrolments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. STUDENT ACCESS LOG  (append-only audit trail)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.student_access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid REFERENCES public.students(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES auth.users(id)      ON DELETE SET NULL,
  actor_email text,
  action      text NOT NULL CHECK (action IN ('view','create','update','delete','export')),
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_access_log_student_idx ON public.student_access_log (student_id, created_at DESC);
CREATE INDEX student_access_log_actor_idx   ON public.student_access_log (actor_id,   created_at DESC);

GRANT SELECT, INSERT ON public.student_access_log TO authenticated;
GRANT ALL            ON public.student_access_log TO service_role;
ALTER TABLE public.student_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access log"   ON public.student_access_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can append access log" ON public.student_access_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.student_access_log_set_actor_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actor_id IS NOT NULL THEN
    SELECT email INTO NEW.actor_email FROM auth.users WHERE id = NEW.actor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER student_access_log_actor_email
  BEFORE INSERT ON public.student_access_log
  FOR EACH ROW EXECUTE FUNCTION public.student_access_log_set_actor_email();


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. STORAGE BUCKETS + POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('branding',     'branding',     false),
  ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read branding" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'branding');
CREATE POLICY "Admins can upload branding"            ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update branding"            ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete branding"            ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read certificates"          ON storage.objects FOR SELECT USING (bucket_id = 'certificates');
CREATE POLICY "Admins can upload certificates"        ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update certificate files"   ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete certificate files"   ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'certificates' AND public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- Done. All tables, functions, triggers, policies, and storage buckets created.
-- =============================================================================
