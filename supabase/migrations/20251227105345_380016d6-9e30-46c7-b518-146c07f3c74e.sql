-- Drop and recreate the view with SECURITY INVOKER (explicit)
DROP VIEW IF EXISTS public.admin_profiles_public;

CREATE VIEW public.admin_profiles_public
WITH (security_invoker = true)
AS
SELECT 
  p.id,
  p.firstname,
  p.lastname
FROM public.profiles p
INNER JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'admin';

-- Grant SELECT access on the view to authenticated users
GRANT SELECT ON public.admin_profiles_public TO authenticated;