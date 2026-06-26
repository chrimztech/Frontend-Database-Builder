-- Add actor_email to the audit log so the UI can show who performed each action
-- without joining to auth.users (which is inaccessible from the client).
ALTER TABLE public.student_access_log
  ADD COLUMN IF NOT EXISTS actor_email text;

-- Trigger function: populate actor_email from auth.users on every INSERT.
-- SECURITY DEFINER so it can read auth.users even from the public schema.
CREATE OR REPLACE FUNCTION public.student_access_log_set_actor_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actor_id IS NOT NULL THEN
    SELECT email INTO NEW.actor_email FROM auth.users WHERE id = NEW.actor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_access_log_actor_email ON public.student_access_log;
CREATE TRIGGER student_access_log_actor_email
  BEFORE INSERT ON public.student_access_log
  FOR EACH ROW EXECUTE FUNCTION public.student_access_log_set_actor_email();

-- Backfill existing rows
UPDATE public.student_access_log sal
SET    actor_email = u.email
FROM   auth.users u
WHERE  sal.actor_id = u.id
  AND  sal.actor_email IS NULL;
