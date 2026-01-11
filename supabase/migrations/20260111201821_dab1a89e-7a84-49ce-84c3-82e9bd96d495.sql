-- Set the view to use invoker security (safer) and grant public access
ALTER VIEW admin_profiles_public SET (security_invoker = on);

-- Grant select access to the anon role so unauthenticated users can see admins during signup
GRANT SELECT ON admin_profiles_public TO anon;
GRANT SELECT ON admin_profiles_public TO authenticated;