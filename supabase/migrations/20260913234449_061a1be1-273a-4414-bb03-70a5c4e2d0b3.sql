REVOKE EXECUTE ON FUNCTION public.jamb_available_subjects(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.jamb_active_questions(integer, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jamb_available_subjects(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jamb_active_questions(integer, text[], integer) TO authenticated;