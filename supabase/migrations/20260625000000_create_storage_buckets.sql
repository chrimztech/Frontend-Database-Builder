-- Create storage buckets if they don't exist.
-- The policies were created in earlier migrations but the buckets were only in combined_setup.sql.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('branding', 'branding', false),
  ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;
