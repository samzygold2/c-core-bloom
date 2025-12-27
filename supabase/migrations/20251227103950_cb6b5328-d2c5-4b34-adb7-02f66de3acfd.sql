-- Drop existing SELECT policy for users and update it
DROP POLICY IF EXISTS "Users can view questions from their assigned admin" ON public.questions;

-- Create policy for users to view questions from their assigned admin only
CREATE POLICY "Users can view questions from their assigned admin"
ON public.questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.assigned_admin_id = questions.created_by
  )
);