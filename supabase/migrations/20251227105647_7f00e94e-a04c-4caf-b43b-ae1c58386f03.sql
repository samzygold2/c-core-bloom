-- Add policy to block anonymous access to password_reset_otps table
CREATE POLICY "Block anonymous access to password_reset_otps"
ON public.password_reset_otps
FOR SELECT
USING (auth.uid() IS NOT NULL);