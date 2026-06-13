-- =====================================================================
-- STUDENTS: structured metadata for richer student profiles
-- =====================================================================
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS students_metadata_gin
  ON public.students USING gin (metadata);
