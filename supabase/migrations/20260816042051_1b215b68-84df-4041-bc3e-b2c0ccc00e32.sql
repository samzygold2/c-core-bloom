DROP POLICY IF EXISTS "Users can view questions for active tests they take" ON public.questions;

DROP POLICY IF EXISTS "Block anonymous access to password_reset_otps" ON public.password_reset_otps;

-- Existing plaintext OTPs are no longer valid
UPDATE public.password_reset_otps SET used = true WHERE used = false;

CREATE OR REPLACE FUNCTION public.validate_otp(p_username text, p_otp text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_otp_record RECORD;
  v_hash text;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_username || '@cbt.local';

  IF v_user_id IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid username or code');
  END IF;

  SELECT * INTO v_otp_record
  FROM public.password_reset_otps
  WHERE user_id = v_user_id
    AND expires_at > now()
    AND used = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_record IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid username or code');
  END IF;

  v_hash := encode(sha256(convert_to(p_otp, 'utf8')), 'hex');

  IF v_otp_record.otp_hash = v_hash THEN
    UPDATE public.password_reset_otps
    SET used = true
    WHERE id = v_otp_record.id;

    RETURN json_build_object('valid', true, 'user_id', v_user_id);
  ELSE
    RETURN json_build_object('valid', false, 'error', 'Invalid username or code');
  END IF;
END;
$function$;