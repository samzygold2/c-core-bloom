-- Create a secure view for admin profiles that only exposes non-sensitive fields
CREATE OR REPLACE VIEW public.admin_profiles_public AS
SELECT 
  p.id,
  p.firstname,
  p.lastname
FROM public.profiles p
INNER JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'admin';

-- Grant SELECT access on the view
GRANT SELECT ON public.admin_profiles_public TO authenticated;

-- Drop the overly permissive policy that exposes all admin profile data
DROP POLICY IF EXISTS "Users can view admin profiles" ON public.profiles;