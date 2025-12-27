-- Add policy to block anonymous access to profiles table
CREATE POLICY "Block anonymous access to profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);