ALTER TABLE public.past_questions DROP CONSTRAINT IF EXISTS chk_pq_answer_letter;
ALTER TABLE public.past_questions DROP CONSTRAINT IF EXISTS chk_pq_year_range;