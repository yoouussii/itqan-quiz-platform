-- =====================================================================
-- منصة إتقان: 057 — لوحة مؤشرات المدرسة
--  - itqan_school_indicators(أشهر، فرع): لكل شهر: الغياب والتأخر لكل طالب، معدل الاختبارات،
--    عدد التسليمات، المخالفات والسلوك الإيجابي، ونسبة تسليم الواجبات.
--    ومقارنة الفصول والفروع على كامل الفترة.
--  - للمدير والمشرف ومن لديه صلاحية التقارير الشاملة. الحساب كله في الخادم.
--  - إصلاح أمني: الملخص الصباحي (050) كان يُرجع أرقامه لطلب بلا تسجيل دخول.
--
-- يتطلب 009 و022 و031 و040 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_school_indicators(p_months int default 6, p_branch text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n int := least(greatest(coalesce(p_months, 6), 1), 24);
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_from date := (date_trunc('month', v_today) - make_interval(months => n - 1))::date;
  v jsonb;
begin
  -- coalesce: بلا جلسة يكون الدور null، و«not null» لا يرفض
  if not coalesce(itqan.is_admin() or itqan.my_role() = 'supervisor' or itqan.has_perm('can_view_all_reports'), false) then return null; end if;

  with st as (
    select u.id, u.class_id, coalesce(nullif(u.branch_id, ''), c.branch_id) as branch_id
      from public.users u left join public.classes c on c.id = u.class_id
     where u.role::text = 'student'
       and (p_branch is null or coalesce(nullif(u.branch_id, ''), c.branch_id) = p_branch)
  ), months as (
    select (v_from + make_interval(months => i))::date as m from generate_series(0, n - 1) i
  ), att as (
    select date_trunc('month', a.day)::date m, st.class_id, st.branch_id,
           count(*) filter (where a.kind = 'absent') absent, count(*) filter (where a.kind = 'late') late
      from public.attendance_records a join st on st.id = a.student_id
     where a.day >= v_from group by 1, 2, 3
  ), sub as (
    select date_trunc('month', s.completed_at at time zone 'Asia/Riyadh')::date m, st.class_id, st.branch_id,
           count(*) n, avg(s.percentage) avg_pct
      from public.submissions s join st on st.id = s.student_id
      join public.quizzes q on q.id::text = s.quiz_id::text and not coalesce(q.is_deleted, false)
     where s.completed_at >= (v_from::timestamp at time zone 'Asia/Riyadh') group by 1, 2, 3
  ), beh as (
    select date_trunc('month', b.day)::date m, st.class_id, st.branch_id,
           count(*) filter (where b.kind = 'violation') viol, count(*) filter (where b.kind = 'positive') pos
      from public.behavior_records b join st on st.id = b.student_id
     where b.day >= v_from group by 1, 2, 3
  ), hw as (
    select date_trunc('month', h.due_at at time zone 'Asia/Riyadh')::date m, h.class_id,
           (select count(*) from st where st.class_id = h.class_id) expected,
           (select count(*) from public.homework_submissions hs join st on st.id = hs.student_id where hs.homework_id = h.id) done
      from public.homework h
     where coalesce(h.allow_submission, true) and h.due_at >= (v_from::timestamp at time zone 'Asia/Riyadh') and h.due_at < now()
  ), cls as (
    select c.id, c.name, c.branch_id, (select count(*) from st where st.class_id = c.id) students
      from public.classes c where exists (select 1 from st where st.class_id = c.id)
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_today, 'months_count', n,
    'students', (select count(*) from st),
    'months', (select jsonb_agg(jsonb_build_object(
        'month', to_char(mo.m, 'YYYY-MM'),
        'absent', coalesce((select sum(absent) from att where att.m = mo.m), 0),
        'late', coalesce((select sum(late) from att where att.m = mo.m), 0),
        'submissions', coalesce((select sum(sub.n) from sub where sub.m = mo.m), 0),
        'quiz_avg', (select round(sum(sub.avg_pct * sub.n) / nullif(sum(sub.n), 0)) from sub where sub.m = mo.m),
        'violations', coalesce((select sum(viol) from beh where beh.m = mo.m), 0),
        'positives', coalesce((select sum(pos) from beh where beh.m = mo.m), 0),
        'hw_rate', (select round(100.0 * sum(done) / nullif(sum(expected), 0)) from hw where hw.m = mo.m)
      ) order by mo.m) from months mo),
    'classes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', cls.id, 'name', cls.name, 'branch_id', cls.branch_id, 'students', cls.students,
        'absent', coalesce((select sum(absent) from att where att.class_id = cls.id), 0),
        'late', coalesce((select sum(late) from att where att.class_id = cls.id), 0),
        'quiz_avg', (select round(sum(sub.avg_pct * sub.n) / nullif(sum(sub.n), 0)) from sub where sub.class_id = cls.id),
        'submissions', coalesce((select sum(sub.n) from sub where sub.class_id = cls.id), 0),
        'violations', coalesce((select sum(viol) from beh where beh.class_id = cls.id), 0),
        'positives', coalesce((select sum(pos) from beh where beh.class_id = cls.id), 0),
        'hw_rate', (select round(100.0 * sum(done) / nullif(sum(expected), 0)) from hw where hw.class_id = cls.id)
      ) order by cls.name) from cls), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name,
        'students', (select count(*) from st where st.branch_id = b.id),
        'absent', coalesce((select sum(absent) from att where att.branch_id = b.id), 0),
        'quiz_avg', (select round(sum(sub.avg_pct * sub.n) / nullif(sum(sub.n), 0)) from sub where sub.branch_id = b.id),
        'violations', coalesce((select sum(viol) from beh where beh.branch_id = b.id), 0)
      ) order by b.name) from public.branches b where p_branch is null), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- إصلاح أمني لـ 050: الملخص الصباحي كان يُرجع البيانات لطلب بلا جلسة للسبب نفسه
create or replace function public.itqan_morning_summary(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(itqan.is_admin() or itqan.my_role() = 'supervisor', false) then return null; end if;
  return itqan.morning_summary_data(coalesce(p_day, (now() at time zone 'Asia/Riyadh')::date));
end $$;

revoke all on function public.itqan_school_indicators(int, text) from public;
grant execute on function public.itqan_school_indicators(int, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 057: لوحة مؤشرات المدرسة' as result;
