-- Add review status to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN DEFAULT false;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster filtering of unreviewed questions
CREATE INDEX IF NOT EXISTS idx_questions_is_reviewed ON public.questions(is_reviewed);