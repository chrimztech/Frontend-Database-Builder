-- Switch certificate codes from sequential to cryptographically random.
-- Old format: PREFIX + YYYY + 7-digit sequence  e.g. PMP20260000004
-- New format: PREFIX + YYYY + 8 random digits   e.g. PMP202647293815
--
-- 1. Broaden the format check (old regex required 11 trailing digits).
ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS certificates_public_code_format_chk;

ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_public_code_format_chk
  CHECK (certificate_code ~ '^[A-Z0-9]{6,24}$' AND certificate_id = certificate_code)
  NOT VALID;

-- 2. Ensure the uniqueness constraint is named and present.
--    The column was created with TEXT UNIQUE so an unnamed constraint already exists,
--    but naming it explicitly makes it identifiable in error codes.
ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS certificates_certificate_code_unique;

ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_certificate_code_unique UNIQUE (certificate_code);
