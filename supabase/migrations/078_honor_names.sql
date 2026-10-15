-- =====================================================================
-- منصة إتقان: 078 — لوحة الشرف: الاسم الأول والثاني والأخير
--  - «عبد الله الأحمد» كان يظهر «عبد الأحمد». الآن الأسماء المركّبة (عبد/أبو/بن/آل + اسم،
--    و… الدين/الله/الرحمن) تُعامل كاسم واحد، ثم يُعرض الاسم الأول والثاني والأخير.
--
-- يتطلب 077. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.honor_name(p text)
returns text language sql immutable set search_path = '' as $$
  with n as (
    select regexp_replace(
             regexp_replace(
               regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'),
               '(^| )(عبد|ابو|أبو|بن|ابن|آل) ', '\1\2_', 'g'),
             ' (الدين|الله|الرحمن)( |$)', '_\1\2', 'g') s
  ), t as (
    select regexp_split_to_array(s, ' ') a from n
  )
  select replace(case when coalesce(array_length(a, 1), 0) <= 3 then array_to_string(a, ' ')
                      else a[1] || ' ' || a[2] || ' ' || a[array_length(a, 1)] end, '_', ' ')
  from t;
$$;

create or replace function public.itqan_honor_roll(p_min numeric default 90, p_days int default 7, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_branch text := itqan.my_branch();
  v_min numeric := greatest(50, least(100, coalesce(p_min, 90)));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(90, coalesce(p_days, 7))));
  v_limit int := greatest(1, least(60, coalesce(p_limit, 30)));
begin
  if itqan.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', x.short_name, 'class', x.class_name, 'quiz', x.quiz_title,
                                        'pct', round(x.percentage), 'at', x.completed_at)
                     order by x.percentage desc, x.completed_at desc)
    from (
      select * from (
        select distinct on (s.student_id)
               s.student_id, s.percentage, s.completed_at, q.title quiz_title, c.name class_name,
               itqan.honor_name(u.name) short_name
        from public.submissions s
        join public.users u on u.id::text = s.student_id::text and u.role::text = 'student'
        join public.quizzes q on q.id::text = s.quiz_id::text
        left join public.classes c on c.id::text = u.class_id::text
        where s.completed_at >= v_since
          and coalesce(s.status, 'completed') = 'completed'
          and not coalesce(s.is_retake, false)
          and coalesce(s.total_possible_score, 0) > 0
          and s.percentage >= v_min
          and coalesce(u.name, '') <> ''
          and (v_branch is null or itqan.user_branch(s.student_id::text) = v_branch)
        order by s.student_id, s.percentage desc, s.completed_at desc
      ) best
      order by best.percentage desc, best.completed_at desc
      limit v_limit
    ) x), '[]'::jsonb);
end $$;

revoke all on function public.itqan_honor_roll(numeric, int, int) from public;
grant execute on function public.itqan_honor_roll(numeric, int, int) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 078: لوحة الشرف بالاسم الأول والثاني والأخير' as result;
