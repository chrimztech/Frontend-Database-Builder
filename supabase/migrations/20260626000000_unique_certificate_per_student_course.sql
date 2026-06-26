-- Enforce one certificate per student per course at the database level.
-- A partial unique index is used so that rows where student_id or course_id
-- is NULL (e.g. manually created records) are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS certificates_student_course_uniq
  ON public.certificates (student_id, course_id)
  WHERE student_id IS NOT NULL AND course_id IS NOT NULL;
