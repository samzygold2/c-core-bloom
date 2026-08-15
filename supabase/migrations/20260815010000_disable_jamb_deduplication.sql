-- Migration: Disable JAMB deduplication and allow full raw API question ingestion

-- 1. Drop unique constraint on aloc_id if exists so every question received by API can be inserted
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.past_questions'::regclass 
      AND (conname LIKE '%aloc_id%' OR contype = 'u')
      AND conname != 'past_questions_pkey'
  ) LOOP
    EXECUTE 'ALTER TABLE public.past_questions DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE;';
  END LOOP;
END $$;

-- 2. Drop unique index on content_hash and recreate as standard non-unique index
DROP INDEX IF EXISTS public.uq_pq_content_hash;
DROP INDEX IF EXISTS public.idx_past_questions_aloc_id;
CREATE INDEX IF NOT EXISTS idx_past_questions_aloc_id ON public.past_questions (aloc_id);
CREATE INDEX IF NOT EXISTS idx_past_questions_content_hash ON public.past_questions (content_hash);

-- 3. Update audit function to allow full API question ingestion without penalizing raw API counts
CREATE OR REPLACE FUNCTION public.audit_jamb_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  total_questions int := 0;
  dup_groups jsonb;
  dup_count int := 0;
  missing_count int := 0;
  invalid_year_count int := 0;
  looping_jobs jsonb;
  orphan_visibility_count int := 0;
  low_coverage_admins jsonb;
  health int := 100;
  report jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: super admin only';
  END IF;

  SELECT count(*) INTO total_questions FROM past_questions;

  SELECT jsonb_agg(row_to_json(d)), coalesce(sum(d.cnt) - count(*), 0)
    INTO dup_groups, dup_count
  FROM (
    SELECT content_hash, subject, year, count(*) cnt, array_agg(id) ids
    FROM past_questions GROUP BY content_hash, subject, year HAVING count(*) > 1
    LIMIT 50
  ) d;

  SELECT count(*) INTO missing_count FROM past_questions
    WHERE correct_answer IS NULL OR option_a IS NULL OR option_b IS NULL
       OR option_c IS NULL OR option_d IS NULL;

  SELECT count(*) INTO invalid_year_count FROM past_questions
    WHERE year < 2009 OR year > 2024;

  SELECT jsonb_agg(row_to_json(j)) INTO looping_jobs FROM (
    SELECT id, status, current_subject, current_year, message,
           coalesce(array_length(errors,1),0) error_count, consecutive_failures
    FROM jamb_sync_jobs
    WHERE status = 'failed'
       OR (status = 'running' AND updated_at < now() - interval '60 seconds')
       OR consecutive_failures >= 5
    ORDER BY started_at DESC LIMIT 10
  ) j;

  SELECT count(*) INTO orphan_visibility_count FROM question_visibility qv
    LEFT JOIN past_questions pq ON pq.id = qv.question_id
    WHERE pq.id IS NULL;

  SELECT jsonb_agg(row_to_json(a)) INTO low_coverage_admins FROM (
    SELECT ur.user_id admin_id,
           count(qv.id) FILTER (WHERE qv.is_active) active_count,
           total_questions,
           round(100.0 * count(qv.id) FILTER (WHERE qv.is_active) / GREATEST(total_questions,1)) coverage_pct
    FROM user_roles ur
    LEFT JOIN question_visibility qv ON qv.admin_id = ur.user_id
    WHERE ur.role IN ('admin','super_admin')
    GROUP BY ur.user_id
    HAVING round(100.0 * count(qv.id) FILTER (WHERE qv.is_active) / GREATEST(total_questions,1)) < 50
       AND total_questions > 100
  ) a;

  -- Health score no longer penalizes API raw repeated instances
  health := GREATEST(0, 100
    - coalesce(missing_count,0) * 2
    - coalesce(invalid_year_count,0) * 5
    - coalesce(jsonb_array_length(looping_jobs),0) * 10
    - coalesce(orphan_visibility_count,0) * 4);

  report := jsonb_build_object(
    'total_questions', total_questions,
    'duplicate_groups', coalesce(dup_groups,'[]'::jsonb),
    'duplicate_count', dup_count,
    'missing_answer_count', missing_count,
    'invalid_year_count', invalid_year_count,
    'looping_jobs', coalesce(looping_jobs,'[]'::jsonb),
    'orphan_visibility_count', orphan_visibility_count,
    'low_coverage_admins', coalesce(low_coverage_admins,'[]'::jsonb),
    'health_score', health,
    'deduplication_disabled', true,
    'audited_at', now()
  );

  INSERT INTO jamb_integrity_audit_log (run_by, health_score, anomalies)
  VALUES (auth.uid(), health, report);

  RETURN report;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_jamb_integrity() TO authenticated;
