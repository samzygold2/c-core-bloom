
-- Allow users to view questions for any active test they are taking
CREATE POLICY "Users can view questions for active tests they take"
ON public.questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tests t
    WHERE t.id = questions.test_id
    AND t.is_active = true
  )
  AND auth.uid() IS NOT NULL
);
