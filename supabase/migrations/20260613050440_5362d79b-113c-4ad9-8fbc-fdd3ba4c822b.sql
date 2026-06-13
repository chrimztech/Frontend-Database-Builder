
-- =====================================================================
-- STUDENTS: category + UNZA student id + consent
-- =====================================================================
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'non_unza'
    CHECK (category IN ('unza','non_unza')),
  ADD COLUMN IF NOT EXISTS unza_student_id text,
  ADD COLUMN IF NOT EXISTS pii_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pii_consent_source text;

-- An UNZA student must have a student id; a non-UNZA student must not have one.
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_unza_id_required;
ALTER TABLE public.students
  ADD CONSTRAINT students_unza_id_required CHECK (
    (category = 'unza' AND unza_student_id IS NOT NULL AND length(trim(unza_student_id)) > 0)
    OR (category = 'non_unza')
  );

-- Uniqueness so the same student isn't entered twice
CREATE UNIQUE INDEX IF NOT EXISTS students_unza_student_id_uniq
  ON public.students (lower(unza_student_id)) WHERE unza_student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_national_id_uniq
  ON public.students (lower(national_id)) WHERE national_id IS NOT NULL;

-- =====================================================================
-- COURSES: category + dual fees + scheduling
-- =====================================================================
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'short_course'
    CHECK (category IN ('self_paced','short_course','special_schedule','professional_diploma')),
  ADD COLUMN IF NOT EXISTS fee_unza numeric(10,2),
  ADD COLUMN IF NOT EXISTS fee_non_unza numeric(10,2),
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS time_slot text,
  ADD COLUMN IF NOT EXISTS mode text
    CHECK (mode IS NULL OR mode IN ('self_paced','interactive','special_schedule','blended'));

-- =====================================================================
-- ENROLMENTS: payment / fee tracking
-- =====================================================================
ALTER TABLE public.enrolments
  ADD COLUMN IF NOT EXISTS fee_charged numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','waived','free'));

-- =====================================================================
-- STUDENT ACCESS LOG (append-only audit trail)
-- =====================================================================
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

DROP POLICY IF EXISTS "Admins can view access log" ON public.student_access_log;
CREATE POLICY "Admins can view access log"
  ON public.student_access_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can append access log" ON public.student_access_log;
CREATE POLICY "Admins can append access log"
  ON public.student_access_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

-- Deliberately no UPDATE or DELETE policy — log is append-only.

CREATE INDEX IF NOT EXISTS student_access_log_student_idx
  ON public.student_access_log (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS student_access_log_actor_idx
  ON public.student_access_log (actor_id, created_at DESC);
