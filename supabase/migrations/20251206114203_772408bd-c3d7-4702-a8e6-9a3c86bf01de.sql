-- Add assigned_admin_id and is_waiting columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN is_waiting boolean DEFAULT false;

-- Create index for faster queries
CREATE INDEX idx_profiles_assigned_admin ON public.profiles(assigned_admin_id);
CREATE INDEX idx_profiles_is_waiting ON public.profiles(is_waiting) WHERE is_waiting = true;

-- Update RLS policy to allow admins to update profiles (for removing users)
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow users to view admin profiles (for signup dropdown)
CREATE POLICY "Users can view admin profiles" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = profiles.id 
    AND user_roles.role = 'admin'
  )
);