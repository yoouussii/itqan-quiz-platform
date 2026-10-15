-- =====================================================================
-- منصة إتقان: 071 — وقت دخول الطالب للاختبار ووقت تسليمه (لسجل النشاط)
--  وقت البدء محفوظ على الخادم منذ 004 (itqan.quiz_attempts) لكنه لم يكن ظاهراً للإدارة.
--  عند التسليم يُحذف سجل البدء، فيُحسب وقت الدخول من وقت التسليم − الوقت المستغرق.
--  للموظفين فقط، وفي فرعهم فقط. من بدأ ولم يسلّم يظهر «لم يسلّم بعد».
--
-- يتطلب 004 و009. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_quiz_activity(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_branch text := itqan.my_branch();
  v_since timestamptz := case when coalesce(p_days, 0) > 0 then now() - make_interval(days => p_days) end;
begin
  if not coalesce(itqan.is_staff(), false) then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'student_id', x.student_id, 'quiz_id', x.quiz_id, 'started_at', x.started_at,
             'completed_at', x.completed_at, 'time_spent', x.time_spent_seconds, 'percentage', x.percentage)
           order by x.started_at desc)
    from (
      select * from (
        -- من سلّم: وقت البدء = وقت التسليم − الوقت المستغرق (يحسبه الخادم من وقت البدء المسجّل)
        select s.student_id::text student_id, s.quiz_id::text quiz_id,
               s.completed_at - make_interval(secs => coalesce(s.time_spent_seconds, 0)) started_at,
               s.completed_at, s.time_spent_seconds, s.percentage
        from public.submissions s
        where s.completed_at is not null and (v_since is null or s.completed_at >= v_since)
          and (v_branch is null or itqan.user_branch(s.student_id::text) = v_branch)
        union all
        -- من بدأ ولم يسلّم بعد (يُحذف سجل البدء عند التسليم)
        select a.student_id, a.quiz_id, a.started_at, null, null, null
        from itqan.quiz_attempts a
        where (v_since is null or a.started_at >= v_since)
          and (v_branch is null or itqan.user_branch(a.student_id) = v_branch)
      ) u
      order by u.started_at desc
      limit 3000
    ) x), '[]'::jsonb);
end $$;

revoke all on function public.itqan_quiz_activity(int) from public;
grant execute on function public.itqan_quiz_activity(int) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 071: وقت دخول الاختبار وتسليمه' as result;
