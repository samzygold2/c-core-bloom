-- Create a SECURITY DEFINER function for server-side test scoring
-- This keeps correct answers secure on the server side
CREATE OR REPLACE FUNCTION public.score_test(
  p_test_session_id uuid,
  p_user_answers jsonb
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_test_id uuid;
  v_user_id uuid;
  v_score integer := 0;
  v_question record;
BEGIN
  -- Validate ownership - get the test session
  SELECT user_id, test_id INTO v_user_id, v_test_id
  FROM user_tests
  WHERE id = p_test_session_id;
  
  -- Check if test session exists
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Test session not found';
  END IF;
  
  -- Verify the caller owns this test session
  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: You can only submit your own test';
  END IF;
  
  -- Check if test already submitted
  IF EXISTS (SELECT 1 FROM user_tests WHERE id = p_test_session_id AND end_time IS NOT NULL) THEN
    RAISE EXCEPTION 'Test already submitted';
  END IF;
  
  -- Calculate score by comparing answers with correct answers
  FOR v_question IN 
    SELECT id, correct_answer
    FROM questions
    WHERE test_id = v_test_id
  LOOP
    IF (p_user_answers->>v_question.id::text)::int = v_question.correct_answer THEN
      v_score := v_score + 1;
    END IF;
  END LOOP;
  
  -- Update test session with score and end time
  UPDATE user_tests
  SET score = v_score,
      end_time = now(),
      answers = p_user_answers
  WHERE id = p_test_session_id;
  
  RETURN jsonb_build_object('score', v_score);
END;
$$;