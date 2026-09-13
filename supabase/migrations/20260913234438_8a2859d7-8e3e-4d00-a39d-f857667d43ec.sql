CREATE OR REPLACE FUNCTION public.jamb_available_subjects(_year integer)
RETURNS TABLE(subject text, cnt bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pq.subject, count(*)::bigint
  FROM public.past_questions pq
  WHERE pq.year = _year
    AND EXISTS (
      SELECT 1 FROM public.question_visibility qv
      WHERE qv.question_id = pq.id AND qv.is_active
    )
  GROUP BY pq.subject
  ORDER BY pq.subject
$$;

CREATE OR REPLACE FUNCTION public.jamb_active_questions(_year integer, _subjects text[], _limit integer DEFAULT 40)
RETURNS TABLE(
  id uuid, subject text, year integer, question_text text,
  option_a text, option_b text, option_c text, option_d text,
  correct_answer text, explanation text, image_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pq.id, pq.subject, pq.year, pq.question_text,
         pq.option_a, pq.option_b, pq.option_c, pq.option_d,
         pq.correct_answer, pq.explanation, pq.image_url
  FROM public.past_questions pq
  WHERE pq.year = _year
    AND pq.subject = ANY(_subjects)
    AND EXISTS (
      SELECT 1 FROM public.question_visibility qv
      WHERE qv.question_id = pq.id AND qv.is_active
    )
  ORDER BY random()
  LIMIT GREATEST(COALESCE(_limit, 40), 1)
$$;

GRANT EXECUTE ON FUNCTION public.jamb_available_subjects(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jamb_active_questions(integer, text[], integer) TO authenticated;