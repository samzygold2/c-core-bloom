-- Migration: Super Admin Instant Approve All JAMB Questions to Admins RPC

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

  -- Verify super_admin or admin access
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = caller_id AND role IN ('super_admin', 'admin')
  ) INTO is_authorized;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Admins and Admins can approve JAMB questions.';
  END IF;

  -- 1. Determine Target Admin(s)
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

  -- 2. Determine Target Questions
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

  -- 3. Upsert Visibility Records for All Selected Admins & Questions
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

  -- 4. Get Admin Profile summaries for UI Co-Response
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

  -- 5. Record in Integrity & Resolution Audit Log
  INSERT INTO public.jamb_integrity_audit_log (
    run_by,
    trigger_source,
    health_score,
    anomalies,
    actions_taken,
    duration_ms
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
