
DROP POLICY "Anyone can view active tests" ON public.tests;

CREATE POLICY "Users can view active tests from their admin"
ON public.tests
FOR SELECT
USING (
  (is_active = true AND created_by IN (
    SELECT assigned_admin_id FROM public.profiles WHERE id = auth.uid()
  ))
  OR (has_role(auth.uid(), 'admin') AND created_by = auth.uid())
  OR has_role(auth.uid(), 'super_admin')
);
