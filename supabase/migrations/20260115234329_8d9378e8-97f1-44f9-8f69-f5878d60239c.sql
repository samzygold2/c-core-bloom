-- Ensure unauthenticated users can read from the public admin directory view during signup.
-- NOTE: With security_invoker = on, RLS on underlying tables may filter everything for anon.
-- The view only exposes non-sensitive columns (id, firstname, lastname), so we keep it as definer (security_invoker = off).

ALTER VIEW public.admin_profiles_public SET (security_invoker = off);

-- Keep explicit grants (safe even if already granted)
GRANT SELECT ON public.admin_profiles_public TO anon;
GRANT SELECT ON public.admin_profiles_public TO authenticated;