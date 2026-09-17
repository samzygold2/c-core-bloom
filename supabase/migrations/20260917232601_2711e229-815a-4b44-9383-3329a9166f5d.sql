create or replace function public.jamb_admin_question_stats(_admin_id uuid)
returns table(subject text, year integer, total bigint, active bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select pq.subject,
         pq.year,
         count(*)::bigint as total,
         count(*) filter (
           where exists (
             select 1 from public.question_visibility qv
             where qv.question_id = pq.id
               and qv.admin_id = _admin_id
               and qv.is_active
           )
         )::bigint as active
  from public.past_questions pq
  group by pq.subject, pq.year
$$;

grant execute on function public.jamb_admin_question_stats(uuid) to authenticated;
grant execute on function public.jamb_admin_question_stats(uuid) to service_role;