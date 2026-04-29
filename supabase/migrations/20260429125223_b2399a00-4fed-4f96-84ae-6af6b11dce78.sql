-- Multi-admin assignment: join table allowing users to be linked to multiple admins
CREATE TABLE IF NOT EXISTS public.user_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  UNIQUE (user_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_user_admins_user ON public.user_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_admins_admin ON public.user_admins(admin_id);

ALTER TABLE public.user_admins ENABLE ROW LEVEL SECURITY;

-- Users can see their own admin links
CREATE POLICY "Users can view their own admin links"
  ON public.user_admins FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can see links pointing to them
CREATE POLICY "Admins can view links pointing to them"
  ON public.user_admins FOR SELECT
  USING (auth.uid() = admin_id AND public.has_role(auth.uid(), 'admin'));

-- Super admins can view all
CREATE POLICY "Super admins can view all user_admins"
  ON public.user_admins FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Users can request a link (always created as pending)
CREATE POLICY "Users can request admin links"
  ON public.user_admins FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Admins can approve/update links pointing to them
CREATE POLICY "Admins can update links pointing to them"
  ON public.user_admins FOR UPDATE
  USING (auth.uid() = admin_id AND public.has_role(auth.uid(), 'admin'));

-- Users can remove their own links; admins can remove links pointing to them
CREATE POLICY "Users can delete their own admin links"
  ON public.user_admins FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete links pointing to them"
  ON public.user_admins FOR DELETE
  USING (auth.uid() = admin_id AND public.has_role(auth.uid(), 'admin'));

-- Backfill: any existing approved primary admin assignment becomes an approved row here
INSERT INTO public.user_admins (user_id, admin_id, status, approved_at)
SELECT p.id, p.assigned_admin_id, 'approved', now()
FROM public.profiles p
WHERE p.assigned_admin_id IS NOT NULL
  AND COALESCE(p.is_pending, false) = false
  AND COALESCE(p.is_waiting, false) = false
ON CONFLICT (user_id, admin_id) DO NOTHING;

-- Update tests visibility: a user can see active tests from any approved admin link
DROP POLICY IF EXISTS "Users can view active tests from their admin" ON public.tests;
CREATE POLICY "Users can view active tests from their admins"
  ON public.tests FOR SELECT
  USING (
    (
      is_active = true
      AND (
        created_by IN (SELECT assigned_admin_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.user_admins ua
          WHERE ua.user_id = auth.uid()
            AND ua.admin_id = tests.created_by
            AND ua.status = 'approved'
        )
      )
    )
    OR (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Update questions visibility for users to mirror multi-admin
DROP POLICY IF EXISTS "Users can view questions from their assigned admin" ON public.questions;
CREATE POLICY "Users can view questions from their admins"
  ON public.questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.assigned_admin_id = questions.created_by
    )
    OR EXISTS (
      SELECT 1 FROM public.user_admins ua
      WHERE ua.user_id = auth.uid()
        AND ua.admin_id = questions.created_by
        AND ua.status = 'approved'
    )
  );