CREATE POLICY "Admins can delete their own results"
ON public.user_tests FOR DELETE TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));