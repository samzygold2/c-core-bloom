
-- Owner-scoped policies for cbt-storage (files placed under <user_id>/...)
CREATE POLICY "cbt-storage: users select own files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cbt-storage'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "cbt-storage: users insert own files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cbt-storage'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "cbt-storage: users update own files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'cbt-storage'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
)
WITH CHECK (
  bucket_id = 'cbt-storage'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "cbt-storage: users delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'cbt-storage'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);
