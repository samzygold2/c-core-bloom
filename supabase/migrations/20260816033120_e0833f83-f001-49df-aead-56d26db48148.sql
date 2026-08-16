CREATE OR REPLACE FUNCTION public.approve_all_jamb_questions(
  target_admin_id uuid DEFAULT NULL,
  specific_year int DEFAULT NULL,
  specific_subject text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  is_authorized boolean;
  admin_ids uuid[];
  target_question_ids uuid[];
  affected_visibility_count int := 0;
  total_questions_count int := 0;
  admins_count int := 0;
  admin_details jsonb;
  start_time timestamptz := clock_timestamp();
  duration_ms int;
  result jsonb;
BEGIN
  caller_id := auth.uid();

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = caller_id AND role IN ('super_admin', 'admin')
  ) INTO is_authorized;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admins and Admins can approve JAMB questions.';
  END IF;

  IF target_admin_id IS NOT NULL THEN
    admin_ids := ARRAY[target_admin_id];
  ELSE
    SELECT array_agg(DISTINCT user_id) INTO admin_ids
    FROM public.user_roles
    WHERE role IN ('admin', 'super_admin');
  END IF;

  IF admin_ids IS NULL OR array_length(admin_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No eligible admins found to approve questions for.',
      'questions_approved', 0,
      'admins_affected', 0
    );
  END IF;

  admins_count := array_length(admin_ids, 1);

  SELECT array_agg(id) INTO target_question_ids
  FROM public.past_questions
  WHERE (specific_year IS NULL OR year = specific_year)
    AND (specific_subject IS NULL OR lower(subject) = lower(specific_subject));

  IF target_question_ids IS NULL OR array_length(target_question_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No past questions found matching the criteria.',
      'questions_approved', 0,
      'admins_affected', 0
    );
  END IF;

  total_questions_count := array_length(target_question_ids, 1);

  WITH inserted AS (
    INSERT INTO public.question_visibility (question_id, admin_id, is_active, activated_at, updated_by)
    SELECT
      q_id,
      a_id,
      true,
      now(),
      caller_id
    FROM unnest(target_question_ids) AS q_id
    CROSS JOIN unnest(admin_ids) AS a_id
    ON CONFLICT (question_id, admin_id)
    DO UPDATE SET
      is_active = true,
      activated_at = now(),
      updated_by = EXCLUDED.updated_by
    RETURNING 1
  )
  SELECT count(*) INTO affected_visibility_count FROM inserted;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', trim(concat(p.firstname, ' ', p.lastname)),
      'email', p.email,
      'active_questions', (
        SELECT count(*) 
        FROM public.question_visibility qv 
        WHERE qv.admin_id = p.id AND qv.is_active = true
      )
    )
  ) INTO admin_details
  FROM public.profiles p
  WHERE p.id = ANY(admin_ids);

  duration_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::int;

  INSERT INTO public.jamb_integrity_audit_log (
    run_by, trigger_source, health_score, anomalies, actions_taken, duration_ms
  ) VALUES (
    caller_id,
    'super_admin_bulk_approval',
    100,
    jsonb_build_object(
      'target_admin_id', target_admin_id,
      'specific_year', specific_year,
      'specific_subject', specific_subject,
      'target_questions_count', total_questions_count
    ),
    jsonb_build_object(
      'action', 'bulk_approve_questions',
      'questions_approved', total_questions_count,
      'admins_affected', admins_count,
      'visibility_records_updated', affected_visibility_count,
      'duration_ms', duration_ms
    ),
    duration_ms
  );

  result := jsonb_build_object(
    'success', true,
    'message', format('Successfully approved %s JAMB question(s) for %s admin(s).', total_questions_count, admins_count),
    'questions_approved', total_questions_count,
    'admins_affected', admins_count,
    'visibility_records_updated', affected_visibility_count,
    'admin_details', coalesce(admin_details, '[]'::jsonb),
    'approved_at', now(),
    'duration_ms', duration_ms
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_all_jamb_questions(uuid, int, text) TO authenticated;

-- Disable JAMB deduplication so every question returned by the API can be stored
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

DROP INDEX IF EXISTS public.uq_pq_content_hash;
DROP INDEX IF EXISTS public.idx_past_questions_aloc_id;
CREATE INDEX IF NOT EXISTS idx_past_questions_aloc_id ON public.past_questions (aloc_id);
CREATE INDEX IF NOT EXISTS idx_past_questions_content_hash ON public.past_questions (content_hash);

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