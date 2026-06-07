
-- JAMB past questions imported from ALOC
CREATE TABLE public.past_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aloc_id text UNIQUE NOT NULL,
  subject text NOT NULL,
  year integer NOT NULL,
  question_text text NOT NULL,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_answer text,
  explanation text,
  image_url text,
  exam_type text DEFAULT 'utme',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_past_questions_subject_year ON public.past_questions(subject, year);

GRANT SELECT ON public.past_questions TO authenticated;
GRANT ALL ON public.past_questions TO service_role;
ALTER TABLE public.past_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view past questions"
ON public.past_questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage past questions"
ON public.past_questions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Per-admin visibility/activation for each past question
CREATE TABLE public.question_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.past_questions(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, admin_id)
);
CREATE INDEX idx_qv_admin_active ON public.question_visibility(admin_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_visibility TO authenticated;
GRANT ALL ON public.question_visibility TO service_role;
ALTER TABLE public.question_visibility ENABLE ROW LEVEL SECURITY;

-- Admins manage their own visibility rows
CREATE POLICY "Admins manage own visibility"
ON public.question_visibility FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid());

-- Super admins manage any
CREATE POLICY "Super admins manage all visibility"
ON public.question_visibility FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Students can see visibility rows for their assigned admin(s) — used to filter active questions
CREATE POLICY "Users view visibility from their admins"
ON public.question_visibility FOR SELECT TO authenticated
USING (
  is_active = true AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.assigned_admin_id = question_visibility.admin_id)
    OR EXISTS (SELECT 1 FROM public.user_admins ua WHERE ua.user_id = auth.uid() AND ua.admin_id = question_visibility.admin_id AND ua.status = 'approved')
  )
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER pq_updated BEFORE UPDATE ON public.past_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER qv_updated BEFORE UPDATE ON public.question_visibility
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
