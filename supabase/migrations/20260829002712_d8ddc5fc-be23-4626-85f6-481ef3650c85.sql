CREATE OR REPLACE FUNCTION public.jamb_question_counts()
RETURNS TABLE(subject text, year integer, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pq.subject, pq.year, count(*)::bigint
  FROM public.past_questions pq
  GROUP BY pq.subject, pq.year
$$;

REVOKE ALL ON FUNCTION public.jamb_question_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jamb_question_counts() TO service_role;