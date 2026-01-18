-- Drop existing insert policy on audit_log
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_log;

-- Create new insert policy that allows admins and super_admins to insert
CREATE POLICY "Admins can insert audit logs"
  ON public.audit_log
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Also add policy for super_admins to insert (in case it doesn't exist)
DROP POLICY IF EXISTS "Super admins can insert audit logs" ON public.audit_log;
CREATE POLICY "Super admins can insert audit logs"
  ON public.audit_log
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));