-- Create system_logs table for monitoring
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  log_level text NOT NULL CHECK (log_level IN ('info', 'warning', 'error', 'critical')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  source text DEFAULT 'system',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can view all system logs
CREATE POLICY "Super admins can view system logs"
ON public.system_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can insert system logs
CREATE POLICY "Super admins can insert system logs"
ON public.system_logs
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can view all user_roles
CREATE POLICY "Super admins can view all user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can manage all user_roles
CREATE POLICY "Super admins can manage user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can view all audit logs
CREATE POLICY "Super admins can view all audit_logs"
ON public.audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can view all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));