UPDATE public.past_questions SET correct_answer = lower(trim(correct_answer)) WHERE correct_answer IS NOT NULL AND correct_answer <> lower(trim(correct_answer));
UPDATE public.past_questions SET correct_answer = NULL WHERE correct_answer IS NOT NULL AND correct_answer NOT IN ('a','b','c','d','e');

ALTER TABLE public.past_questions
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_quarantined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

ALTER TABLE public.past_questions
  ADD COLUMN IF NOT EXISTS content_hash text GENERATED ALWAYS AS (
    md5(subject || '|' || year || '|' || lower(trim(substring(question_text from 1 for 200))))
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pq_year_range') THEN
    ALTER TABLE public.past_questions ADD CONSTRAINT chk_pq_year_range CHECK (year BETWEEN 2009 AND 2024);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pq_answer_letter') THEN
    ALTER TABLE public.past_questions ADD CONSTRAINT chk_pq_answer_letter CHECK (correct_answer IS NULL OR correct_answer IN ('a','b','c','d','e'));
  END IF;
END $$;

ALTER TABLE public.jamb_sync_jobs
  ADD COLUMN IF NOT EXISTS task_retry_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS one_running_sync_job
  ON public.jamb_sync_jobs ((status))
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.jamb_integrity_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  run_by uuid REFERENCES auth.users(id),
  trigger_source text NOT NULL DEFAULT 'manual',
  health_score int NOT NULL,
  anomalies jsonb NOT NULL,
  actions_taken jsonb,
  duration_ms int
);

CREATE INDEX IF NOT EXISTS idx_audit_log_run_at ON public.jamb_integrity_audit_log (run_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jamb_integrity_audit_log TO authenticated;
GRANT ALL ON public.jamb_integrity_audit_log TO service_role;
ALTER TABLE public.jamb_integrity_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view and insert audit logs') THEN
    CREATE POLICY "Admins can view and insert audit logs"
      ON public.jamb_integrity_audit_log FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.jamb_run_integrity_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  report jsonb;
  total_questions int;
  dup_groups jsonb;
  dup_count int;
  missing_count int;
  invalid_year_count int;
  looping_jobs jsonb;
  orphan_visibility_count int;
  low_coverage_admins jsonb;
  health int;
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

  health := GREATEST(0, 100
    - coalesce(dup_count,0) * 3
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
    'audited_at', now()
  );

  INSERT INTO jamb_integrity_audit_log (run_by, health_score, anomalies)
  VALUES (auth.uid(), health, report);

  RETURN report;
END;
$$;

CREATE OR REPLACE FUNCTION public.jamb_resolve_integrity_issues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  deleted_dupes int := 0;
  quarantined_years int := 0;
  flagged_missing int := 0;
  paused_jobs int := 0;
  synced_visibility int := 0;
  cleaned_orphans int := 0;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: super admin only';
  END IF;

  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY content_hash ORDER BY created_at ASC) rn
    FROM past_questions
  ), doomed AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM past_questions WHERE id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS deleted_dupes = ROW_COUNT;

  UPDATE past_questions
     SET needs_review = true
   WHERE (correct_answer IS NULL OR option_a IS NULL OR option_b IS NULL
          OR option_c IS NULL OR option_d IS NULL)
     AND needs_review = false;
  GET DIAGNOSTICS flagged_missing = ROW_COUNT;

  UPDATE question_visibility qv SET is_active = false
    FROM past_questions pq
   WHERE qv.question_id = pq.id AND pq.needs_review = true AND qv.is_active = true;

  UPDATE past_questions
     SET is_quarantined = true, quarantine_reason = 'year out of 2009-2024 range'
   WHERE (year < 2009 OR year > 2024) AND is_quarantined = false;
  GET DIAGNOSTICS quarantined_years = ROW_COUNT;

  UPDATE question_visibility qv SET is_active = false
    FROM past_questions pq
   WHERE qv.question_id = pq.id AND pq.is_quarantined = true AND qv.is_active = true;

  UPDATE jamb_sync_jobs
     SET status = 'paused',
         message = 'Paused automatically by Integrity & Recursion Guard'
   WHERE status = 'failed'
      OR (status = 'running' AND updated_at < now() - interval '60 seconds')
      OR consecutive_failures >= 5;
  GET DIAGNOSTICS paused_jobs = ROW_COUNT;

  DELETE FROM question_visibility qv
   WHERE NOT EXISTS (SELECT 1 FROM past_questions pq WHERE pq.id = qv.question_id);
  GET DIAGNOSTICS cleaned_orphans = ROW_COUNT;

  INSERT INTO question_visibility (question_id, admin_id, is_active, activated_at, updated_by)
  SELECT pq.id, ur.user_id, true, now(), auth.uid()
  FROM past_questions pq
  CROSS JOIN (SELECT user_id FROM user_roles WHERE role IN ('admin','super_admin')) ur
  WHERE pq.needs_review = false AND pq.is_quarantined = false
    AND NOT EXISTS (
      SELECT 1 FROM question_visibility qv
      WHERE qv.question_id = pq.id AND qv.admin_id = ur.user_id
    )
  ON CONFLICT (question_id, admin_id) DO NOTHING;
  GET DIAGNOSTICS synced_visibility = ROW_COUNT;

  result := jsonb_build_object(
    'deleted_duplicates', deleted_dupes,
    'flagged_missing_answer', flagged_missing,
    'quarantined_invalid_year', quarantined_years,
    'paused_looping_jobs', paused_jobs,
    'orphan_visibility_removed', cleaned_orphans,
    'visibility_backfilled', synced_visibility,
    'resolved_at', now()
  );

  UPDATE jamb_integrity_audit_log
     SET actions_taken = result
   WHERE id = (SELECT id FROM jamb_integrity_audit_log ORDER BY run_at DESC LIMIT 1);

  RETURN result;
END;
$$;

CREATE OR REPLACE VIEW public.past_questions_clean AS
  SELECT * FROM public.past_questions WHERE needs_review = false AND is_quarantined = false;

GRANT SELECT ON public.past_questions_clean TO authenticated;
GRANT EXECUTE ON FUNCTION public.jamb_run_integrity_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jamb_resolve_integrity_issues() TO authenticated;