-- Create system_config table for platform-wide settings
CREATE TABLE public.system_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Only super admins can view and manage system config
CREATE POLICY "Super admins can view system config"
ON public.system_config
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage system config"
ON public.system_config
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Insert default configuration values
INSERT INTO public.system_config (key, value, description) VALUES
  ('test_defaults', '{"defaultDuration": 30, "defaultQuestionCount": 10, "shuffleQuestions": true, "shuffleOptions": true}', 'Default settings for new tests'),
  ('pass_thresholds', '{"passPercentage": 50, "excellentPercentage": 80, "showResultsImmediately": true}', 'Score thresholds and result display settings'),
  ('email_settings', '{"enableNotifications": false, "adminEmailOnTestComplete": false, "studentEmailOnTestComplete": false}', 'Email notification settings'),
  ('platform_settings', '{"maintenanceMode": false, "allowNewRegistrations": true, "requireAdminApproval": true}', 'General platform settings');