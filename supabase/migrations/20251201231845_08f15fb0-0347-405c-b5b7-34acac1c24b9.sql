-- Update profiles table to use firstname and lastname instead of username
ALTER TABLE public.profiles 
  DROP COLUMN username,
  ADD COLUMN firstname text NOT NULL DEFAULT '',
  ADD COLUMN lastname text NOT NULL DEFAULT '';

-- Update the handle_new_user function to use firstname and lastname
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, firstname, lastname, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'firstname', ''),
    COALESCE(NEW.raw_user_meta_data->>'lastname', ''),
    NEW.email
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$function$;

-- Fix email exposure and user_questions RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Secure questions table - admins only
DROP POLICY IF EXISTS "Users can view questions for active tests" ON public.questions;

CREATE POLICY "Admin only access to questions"
ON public.questions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));