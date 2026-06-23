-- Keep the public certificate identifier deterministic and prevent the legacy
-- dashed/random certificate_id default from leaking back into new records.

-- 1. Backfill older rows so certificate_code is always populated.
UPDATE public.certificates
SET certificate_code = certificate_id
WHERE certificate_code IS NULL;

-- 2. Where the new sequential code already exists, make the legacy
-- certificate_id column mirror it. Skip only impossible conflicts so the
-- migration stays safe on databases with hand-edited historical records.
UPDATE public.certificates AS cert
SET certificate_id = cert.certificate_code
WHERE cert.certificate_code IS NOT NULL
  AND cert.certificate_id IS DISTINCT FROM cert.certificate_code
  AND NOT EXISTS (
    SELECT 1
    FROM public.certificates AS other
    WHERE other.id <> cert.id
      AND other.certificate_id = cert.certificate_code
  );

-- 3. Canonicalize every future insert/update at the database boundary.
CREATE OR REPLACE FUNCTION public.sync_certificate_public_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.certificate_code := upper(regexp_replace(coalesce(NEW.certificate_code, NEW.certificate_id), '[^A-Za-z0-9]', '', 'g'));
  NEW.certificate_id := NEW.certificate_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_certificate_public_code_before_write ON public.certificates;
CREATE TRIGGER sync_certificate_public_code_before_write
  BEFORE INSERT OR UPDATE OF certificate_id, certificate_code
  ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_certificate_public_code();

-- 4. Enforce PREFIX + YYYY + 7 digit sequence for new/updated rows.
-- Existing historical rows are not scanned because this is NOT VALID.
ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS certificates_public_code_format_chk;

ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_public_code_format_chk
  CHECK (certificate_code ~ '^[A-Z0-9]{6,24}$' AND certificate_id = certificate_code)
  NOT VALID;

CREATE INDEX IF NOT EXISTS certificates_public_code_lookup_idx
  ON public.certificates (certificate_code, certificate_id);

-- 5. Audit view for any historical rows that still need manual cleanup.
CREATE OR REPLACE VIEW public.certificate_public_code_issues AS
SELECT
  id,
  certificate_id,
  certificate_code,
  created_at,
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
