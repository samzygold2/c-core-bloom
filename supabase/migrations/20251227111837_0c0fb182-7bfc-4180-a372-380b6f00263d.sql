-- Add created_by column to tests table
ALTER TABLE public.tests 
ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Update existing tests to have a created_by (set to null for now, admins will need to recreate)
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage tests" ON public.tests;

-- Create new policies for admin-specific test management
CREATE POLICY "Admins can view their own tests" 
ON public.tests 
FOR SELECT 
USING (
  (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid()) 
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Admins can insert their own tests" 
ON public.tests 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid()
);

CREATE POLICY "Admins can update their own tests" 
ON public.tests 
FOR UPDATE 
USING (
  (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid()) 
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Admins can delete their own tests" 
ON public.tests 
FOR DELETE 
USING (
  (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid()) 
  OR has_role(auth.uid(), 'super_admin'::app_role)
);