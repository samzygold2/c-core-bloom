DROP POLICY IF EXISTS "Authenticated users can view past questions" ON public.past_questions;
CREATE POLICY "Admins can view past questions"
ON public.past_questions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "Anyone can create reset requests" ON public.password_reset_requests;