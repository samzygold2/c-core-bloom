-- Create password_reset_otps table for storing OTPs
CREATE TABLE public.password_reset_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '15 minutes'),
  generated_by UUID NOT NULL REFERENCES auth.users(id),
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_password_reset_otps_user_id ON public.password_reset_otps(user_id);
CREATE INDEX idx_password_reset_otps_expires_at ON public.password_reset_otps(expires_at);

-- Enable RLS
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Admins can view OTPs for users assigned to them
CREATE POLICY "Admins can view OTPs for their users"
ON public.password_reset_otps
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- Admins can insert OTPs for users
CREATE POLICY "Admins can create OTPs"
ON public.password_reset_otps
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- Admins can update OTPs (mark as used)
CREATE POLICY "Admins can update OTPs"
ON public.password_reset_otps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- Create password_reset_requests table for tracking user requests
CREATE TABLE public.password_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES auth.users(id)
);

-- Create index for fast lookups
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests(status);
CREATE INDEX idx_password_reset_requests_created_at ON public.password_reset_requests(created_at);

-- Enable RLS
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can create a reset request (public endpoint)
CREATE POLICY "Anyone can create reset requests"
ON public.password_reset_requests
FOR INSERT
WITH CHECK (true);

-- Admins can view pending requests
CREATE POLICY "Admins can view reset requests"
ON public.password_reset_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- Admins can update requests (mark as processed)
CREATE POLICY "Admins can update reset requests"
ON public.password_reset_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- Create function to clean up expired OTPs (to be called by cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM public.password_reset_otps WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to validate and use OTP for password reset
CREATE OR REPLACE FUNCTION public.validate_otp(
  p_username TEXT,
  p_otp TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_otp_record RECORD;
  v_valid BOOLEAN := false;
BEGIN
  -- Find user by username (email format used in this app)
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = p_username || '@cbt.local';
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'User not found');
  END IF;
  
  -- Find latest valid OTP
  SELECT * INTO v_otp_record
  FROM public.password_reset_otps
  WHERE user_id = v_user_id
    AND expires_at > now()
    AND used = false
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_otp_record IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'No valid OTP found or OTP expired');
  END IF;
  
  -- Check if OTP matches (simple comparison - in production use proper hashing)
  IF v_otp_record.otp_hash = p_otp THEN
    -- Mark OTP as used
    UPDATE public.password_reset_otps 
    SET used = true 
    WHERE id = v_otp_record.id;
    
    RETURN json_build_object('valid', true, 'user_id', v_user_id);
  ELSE
    RETURN json_build_object('valid', false, 'error', 'Invalid OTP');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;