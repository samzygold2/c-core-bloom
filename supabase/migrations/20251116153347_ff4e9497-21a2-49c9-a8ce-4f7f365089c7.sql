-- Drop the existing policy that exposes correct answers to users
DROP POLICY IF EXISTS "Users can view questions for active tests" ON public.questions;

-- Create a view for users that excludes the correct_answer column
CREATE OR REPLACE VIEW public.user_questions AS
SELECT 
  id,
  test_id,
  question_text,
  options,
  difficulty,
  created_at
FROM public.questions;

-- Enable RLS on the view
ALTER VIEW public.user_questions SET (security_invoker = on);

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.user_questions TO authenticated;

-- Create RLS policy on the view for active tests only
CREATE POLICY "Users can view questions for active tests"
ON public.questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM tests
    WHERE tests.id = questions.test_id 
    AND tests.is_active = true
  )
  AND NOT has_role(auth.uid(), 'admin'::app_role)
);

-- Update the admin policy to ensure they can still see everything
-- (the existing "Admins can manage questions" policy already handles this)