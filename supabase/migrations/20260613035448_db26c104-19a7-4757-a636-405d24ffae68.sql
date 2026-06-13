
-- =============================
-- COURSES
-- =============================
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

CREATE POLICY "Anyone can view active courses"
  ON public.courses FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert courses"
  ON public.courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update courses"
  ON public.courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete courses"
  ON public.courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================
-- STUDENTS
-- =============================
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

CREATE POLICY "Admins can view students"
  ON public.students FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert students"
  ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update students"
  ON public.students FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete students"
  ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================
-- ENROLMENT STATUS ENUM
-- =============================
CREATE TYPE public.enrolment_status AS ENUM (
  'enrolled',
  'in_progress',
  'completed',
  'certified'
);

-- =============================
-- ENROLMENTS
-- =============================
CREATE TABLE public.enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  status public.enrolment_status NOT NULL DEFAULT 'enrolled',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  certificate_id uuid, -- set when certified
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

CREATE POLICY "Admins can view enrolments"
  ON public.enrolments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert enrolments"
  ON public.enrolments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update enrolments"
  ON public.enrolments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete enrolments"
  ON public.enrolments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER enrolments_updated_at
  BEFORE UPDATE ON public.enrolments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================
-- CERTIFICATES: extend
-- =============================
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

-- Link enrolment FK now that certificates can be referenced
ALTER TABLE public.enrolments
  ADD CONSTRAINT enrolments_certificate_fk
  FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE SET NULL;

-- =============================
-- SEED COURSES
-- =============================
INSERT INTO public.courses (code, name, prefix, description) VALUES
  ('WEB-DEV', 'Web Development', 'WEB', 'Full-stack web development programme'),
  ('DATA-ANL', 'Data Analytics', 'DATA', 'Data analysis & visualization'),
  ('PM-FUND', 'Project Management', 'PM', 'Project management fundamentals')
ON CONFLICT (code) DO NOTHING;
