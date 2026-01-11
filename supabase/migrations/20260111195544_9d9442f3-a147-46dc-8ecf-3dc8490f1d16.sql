-- Drop and recreate the admin_profiles_public view to include both admin and super_admin roles
DROP VIEW IF EXISTS admin_profiles_public;

CREATE VIEW admin_profiles_public AS
SELECT 
  p.id,
  p.firstname,
  p.lastname
FROM profiles p
INNER JOIN user_roles ur ON p.id = ur.user_id
WHERE ur.role IN ('admin', 'super_admin');