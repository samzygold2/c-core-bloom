CREATE OR REPLACE FUNCTION public.get_database_storage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_db_bytes bigint;
  tables_info jsonb;
  questions_count int;
  visibility_count int;
  sync_jobs_count int;
  audit_logs_count int;
  test_submissions_count int;
  profiles_count int;
  subject_distribution jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin or super_admin required';
  END IF;

  SELECT pg_database_size(current_database()) INTO total_db_bytes;

  SELECT jsonb_agg(row_to_json(t)) INTO tables_info FROM (
    SELECT 
      table_name,
      pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as total_size,
      pg_total_relation_size(quote_ident(table_name)) as size_bytes
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
  ) t;

  SELECT count(*) INTO questions_count FROM public.past_questions;
  SELECT count(*) INTO visibility_count FROM public.question_visibility;
  SELECT count(*) INTO sync_jobs_count FROM public.jamb_sync_jobs;
  SELECT count(*) INTO audit_logs_count FROM public.jamb_integrity_audit_log;
  SELECT count(*) INTO test_submissions_count FROM public.user_tests;
  SELECT count(*) INTO profiles_count FROM public.profiles;

  SELECT jsonb_object_agg(subject, cnt) INTO subject_distribution FROM (
    SELECT subject, count(*) as cnt
    FROM public.past_questions
    GROUP BY subject
    ORDER BY cnt DESC
  ) s;

  result := jsonb_build_object(
    'total_db_size_pretty', pg_size_pretty(total_db_bytes),
    'total_db_size_bytes', total_db_bytes,
    'questions_count', questions_count,
    'visibility_count', visibility_count,
    'sync_jobs_count', sync_jobs_count,
    'audit_logs_count', audit_logs_count,
    'test_submissions_count', test_submissions_count,
    'profiles_count', profiles_count,
    'subject_distribution', coalesce(subject_distribution, '{}'::jsonb),
    'tables_breakdown', coalesce(tables_info, '[]'::jsonb),
    'storage_level_pct', LEAST(100.0, ROUND(questions_count * 100.0 / 5000, 1)),
    'target_question_capacity', 5000,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_database_storage_stats() TO authenticated;