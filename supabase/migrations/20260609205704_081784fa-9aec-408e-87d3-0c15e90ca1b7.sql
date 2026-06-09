CREATE TABLE public.jamb_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  subjects text[] NOT NULL,
  years int[] NOT NULL,
  total_per_call int NOT NULL DEFAULT 40,
  pages int NOT NULL DEFAULT 1,
  current_subject text,
  current_year int,
  current_page int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  errors text[] NOT NULL DEFAULT '{}',
  message text,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jamb_sync_jobs TO authenticated;
GRANT ALL ON public.jamb_sync_jobs TO service_role;

ALTER TABLE public.jamb_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view sync jobs"
  ON public.jamb_sync_jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage sync jobs"
  ON public.jamb_sync_jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_jamb_sync_jobs_updated_at
  BEFORE UPDATE ON public.jamb_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_jamb_sync_jobs_status ON public.jamb_sync_jobs(status, started_at DESC);