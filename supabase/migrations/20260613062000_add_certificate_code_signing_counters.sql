
-- Add certificate_code column (the human-readable code like "WEB-20260613-0001")
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS certificate_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS signed_payload JSONB,
  ADD COLUMN IF NOT EXISTS signature TEXT;

CREATE INDEX IF NOT EXISTS certificates_code_idx ON public.certificates (certificate_code);

-- Certificate counters: tracks the next sequential number per course
CREATE TABLE IF NOT EXISTS public.certificate_counters (
  course_id UUID PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.certificate_counters TO service_role;
GRANT ALL ON public.certificate_counters TO service_role;

ALTER TABLE public.certificate_counters ENABLE ROW LEVEL SECURITY;

-- Only service_role (server-side admin) can touch counters
CREATE POLICY "Service role manages counters"
  ON public.certificate_counters
  USING (true)
  WITH CHECK (true);

-- RPC to atomically increment and return the new counter value
CREATE OR REPLACE FUNCTION public.increment_certificate_counter(p_course_id UUID)
RETURNS TABLE (last_number INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.certificate_counters (course_id, last_number)
    VALUES (p_course_id, 1)
  ON CONFLICT (course_id) DO UPDATE
    SET last_number = public.certificate_counters.last_number + 1,
        updated_at  = now();

  RETURN QUERY
    SELECT c.last_number FROM public.certificate_counters c WHERE c.course_id = p_course_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_certificate_counter(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_certificate_counter(UUID) TO service_role;
