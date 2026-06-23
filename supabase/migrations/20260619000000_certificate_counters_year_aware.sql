
-- Make certificate_counters track per-course per-year counts so the
-- sequential certificate number (e.g. PMP20260000001) resets each year.

-- 1. Add year_issued column; existing rows default to the current year.
ALTER TABLE public.certificate_counters
  ADD COLUMN IF NOT EXISTS year_issued INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER;

-- 2. Drop the old single-column primary key (course_id alone is no longer unique
--    once we store one row per course per year).
ALTER TABLE public.certificate_counters DROP CONSTRAINT IF EXISTS certificate_counters_pkey;

-- 3. New composite primary key: one counter row per (course, year).
ALTER TABLE public.certificate_counters ADD PRIMARY KEY (course_id, year_issued);

-- 4. Replace the RPC with the year-aware version.
--    Old signature:  increment_certificate_counter(p_course_id uuid)
--    New signature:  increment_certificate_counter(p_course_id uuid, p_year integer DEFAULT 0)
--    p_year = 0 → use current calendar year (backwards-compatible default).
DROP FUNCTION IF EXISTS public.increment_certificate_counter(UUID);

CREATE OR REPLACE FUNCTION public.increment_certificate_counter(
  p_course_id UUID,
  p_year      INTEGER DEFAULT 0
)
RETURNS TABLE (last_number INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  v_year := CASE WHEN p_year = 0 THEN EXTRACT(YEAR FROM now())::INTEGER ELSE p_year END;

  INSERT INTO public.certificate_counters (course_id, last_number, year_issued)
    VALUES (p_course_id, 1, v_year)
  ON CONFLICT (course_id, year_issued) DO UPDATE
    SET last_number = public.certificate_counters.last_number + 1,
        updated_at  = now();

  RETURN QUERY
    SELECT c.last_number
    FROM public.certificate_counters c
    WHERE c.course_id = p_course_id AND c.year_issued = v_year;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_certificate_counter(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_certificate_counter(UUID, INTEGER) TO service_role;
