-- =====================================================================
-- منصة إتقان: 058 — مؤشرات المدرسة: من بداية الدراسة، باليوم/الأسبوع/الشهر، وتفاصيل الطلاب
--  - itqan_indicators(من، إلى، تجميع، فرع): من بداية العام الدراسي (إعداد الحضور start_date) افتراضياً،
--    مجمّعة يومياً أو أسبوعياً (الأحد–السبت) أو شهرياً، مع مقارنة الفصول والفروع.
--  - itqan_indicator_students(من، إلى، فرع، فصل): لكل طالب: الغياب والتأخر، معدل الاختبارات وعددها،
--    المخالفات والسلوك الإيجابي، والواجبات المسلّمة من المطلوبة (لتفاصيل البطاقات والفصول والتصدير).
--  - للمدير والمشرف ومن لديه صلاحية التقارير الشاملة.
--
-- يتطلب 057 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.indicators_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(itqan.is_admin() or itqan.my_role() = 'supervisor' or itqan.has_perm('can_view_all_reports'), false);
$$;

-- بداية العام الدراسي (من إعداد الحضور)، وإلا 23 أغسطس من العام الدراسي الحالي
create or replace function itqan.school_year_start()
returns date language sql stable security definer set search_path = '' as $$
  select coalesce((select start_date from itqan.attendance_config where id = 1),
    make_date(extract(year from (now() at time zone 'Asia/Riyadh'))::int - case when extract(month from (now() at time zone 'Asia/Riyadh')) < 8 then 1 else 0 end, 8, 23));
$$;

create or replace function itqan.ind_bucket(d date, g text)
returns date language sql immutable set search_path = '' as $$
  select case g when 'day' then d when 'month' then date_trunc('month', d)::date else d - extract(dow from d)::int end;
$$;

create or replace function public.itqan_indicators(p_from date default null, p_to date default null, p_gran text default 'week', p_branch text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_from date; v_to date; g text := case when p_gran in ('day', 'week', 'month') then p_gran else 'week' end;
  t0 timestamptz; t1 timestamptz;
  v jsonb;
begin
  if not itqan.indicators_allowed() then return null; end if;
  v_from := greatest(coalesce(p_from, itqan.school_year_start()), itqan.school_year_start());
  v_to := least(coalesce(p_to, v_today), v_today);
  if v_to < v_from then v_to := v_from; end if;
  if g = 'day' and v_to - v_from > 120 then v_from := v_to - 120; end if;
  t0 := v_from::timestamp at time zone 'Asia/Riyadh';
  t1 := (v_to + 1)::timestamp at time zone 'Asia/Riyadh';

  with st as (
    select u.id, u.class_id, coalesce(nullif(u.branch_id, ''), c.branch_id) as branch_id
      from public.users u left join public.classes c on c.id = u.class_id
     where u.role::text = 'student' and (p_branch is null or coalesce(nullif(u.branch_id, ''), c.branch_id) = p_branch)
  ), buckets as (
    select distinct itqan.ind_bucket(d::date, g) b from generate_series(v_from, v_to, interval '1 day') d
  ), att as (
    select itqan.ind_bucket(a.day, g) b, st.class_id, st.branch_id,
           count(*) filter (where a.kind = 'absent') absent, count(*) filter (where a.kind = 'late') late
      from public.attendance_records a join st on st.id = a.student_id
     where a.day between v_from and v_to group by 1, 2, 3
  ), sub as (
    select itqan.ind_bucket((s.completed_at at time zone 'Asia/Riyadh')::date, g) b, st.class_id, st.branch_id, count(*) n, avg(s.percentage) avg_pct
      from public.submissions s join st on st.id = s.student_id
      join public.quizzes q on q.id::text = s.quiz_id::text and not coalesce(q.is_deleted, false)
     where s.completed_at >= t0 and s.completed_at < t1 group by 1, 2, 3
  ), beh as (
    select itqan.ind_bucket(b.day, g) b, st.class_id, st.branch_id,
           count(*) filter (where b.kind = 'violation') viol, count(*) filter (where b.kind = 'positive') pos
      from public.behavior_records b join st on st.id = b.student_id
     where b.day between v_from and v_to group by 1, 2, 3
  ), hw as (
    select itqan.ind_bucket((h.due_at at time zone 'Asia/Riyadh')::date, g) b, h.class_id,
           (select count(*) from st where st.class_id = h.class_id) expected,
           (select count(*) from public.homework_submissions hs join st on st.id = hs.student_id where hs.homework_id = h.id) done
      from public.homework h
     where coalesce(h.allow_submission, true) and h.due_at >= t0 and h.due_at < least(t1, now())
  ), cls as (
    select c.id, c.name, c.branch_id, (select count(*) from st where st.class_id = c.id) students
      from public.classes c where exists (select 1 from st where st.class_id = c.id)
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to, 'gran', g, 'school_start', itqan.school_year_start(),
    'students', (select count(*) from st),
    'series', (select jsonb_agg(jsonb_build_object(
        'key', to_char(bk.b, 'YYYY-MM-DD'),
        'absent', coalesce((select sum(absent) from att where att.b = bk.b), 0),
        'late', coalesce((select sum(late) from att where att.b = bk.b), 0),
        'submissions', coalesce((select sum(sub.n) from sub where sub.b = bk.b), 0),
        'quiz_avg', (select round(sum(sub.avg_pct * sub.n) / nullif(sum(sub.n), 0)) from sub where sub.b = bk.b),
        'violations', coalesce((select sum(viol) from beh where beh.b = bk.b), 0),
        'positives', coalesce((select sum(pos) from beh where beh.b = bk.b), 0),
        'hw_rate', (select round(100.0 * sum(done) / nullif(sum(expected), 0)) from hw where hw.b = bk.b)
      ) order by bk.b) from buckets bk),
    'totals', jsonb_build_object(
        'absent', coalesce((select sum(absent) from att), 0), 'late', coalesce((select sum(late) from att), 0),
        'submissions', coalesce((select sum(n) from sub), 0),
        'quiz_avg', (select round(sum(avg_pct * n) / nullif(sum(n), 0)) from sub),
        'violations', coalesce((select sum(viol) from beh), 0), 'positives', coalesce((select sum(pos) from beh), 0),
        'hw_rate', (select round(100.0 * sum(done) / nullif(sum(expected), 0)) from hw)),
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
        'id', b.id, 'name', b.name, 'students', (select count(*) from st where st.branch_id = b.id),
        'absent', coalesce((select sum(absent) from att where att.branch_id = b.id), 0),
        'quiz_avg', (select round(sum(sub.avg_pct * sub.n) / nullif(sum(sub.n), 0)) from sub where sub.branch_id = b.id),
        'violations', coalesce((select sum(viol) from beh where beh.branch_id = b.id), 0)
      ) order by b.name) from public.branches b where p_branch is null), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.itqan_indicator_students(p_from date default null, p_to date default null, p_branch text default null, p_class text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_from date; v_to date; t0 timestamptz; t1 timestamptz;
begin
  if not itqan.indicators_allowed() then return null; end if;
  v_from := greatest(coalesce(p_from, itqan.school_year_start()), itqan.school_year_start());
  v_to := least(coalesce(p_to, v_today), v_today);
  t0 := v_from::timestamp at time zone 'Asia/Riyadh'; t1 := (v_to + 1)::timestamp at time zone 'Asia/Riyadh';
  return coalesce((select jsonb_agg(r order by r ->> 'name') from (
    select jsonb_build_object(
      'id', u.id, 'name', u.name, 'class_id', u.class_id, 'class_name', c.name,
      'absent', (select count(*) from public.attendance_records a where a.student_id = u.id and a.kind = 'absent' and a.day between v_from and v_to),
      'late', (select count(*) from public.attendance_records a where a.student_id = u.id and a.kind = 'late' and a.day between v_from and v_to),
      'quizzes', (select count(*) from public.submissions s join public.quizzes q on q.id::text = s.quiz_id::text and not coalesce(q.is_deleted, false) where s.student_id = u.id and s.completed_at >= t0 and s.completed_at < t1),
      'quiz_avg', (select round(avg(s.percentage)) from public.submissions s join public.quizzes q on q.id::text = s.quiz_id::text and not coalesce(q.is_deleted, false) where s.student_id = u.id and s.completed_at >= t0 and s.completed_at < t1),
      'violations', (select count(*) from public.behavior_records b where b.student_id = u.id and b.kind = 'violation' and b.day between v_from and v_to),
      'positives', (select count(*) from public.behavior_records b where b.student_id = u.id and b.kind = 'positive' and b.day between v_from and v_to),
      'hw_due', (select count(*) from public.homework h where h.class_id = u.class_id and coalesce(h.allow_submission, true) and h.due_at >= t0 and h.due_at < least(t1, now())),
      'hw_done', (select count(*) from public.homework h join public.homework_submissions hs on hs.homework_id = h.id and hs.student_id = u.id
                  where h.class_id = u.class_id and coalesce(h.allow_submission, true) and h.due_at >= t0 and h.due_at < least(t1, now()))
    ) r
    from public.users u left join public.classes c on c.id = u.class_id
    where u.role::text = 'student'
      and (p_class is null or u.class_id = p_class)
      and (p_branch is null or coalesce(nullif(u.branch_id, ''), c.branch_id) = p_branch)
  ) x), '[]'::jsonb);
end $$;

revoke all on function public.itqan_indicators(date, date, text, text), public.itqan_indicator_students(date, date, text, text) from public;
grant execute on function public.itqan_indicators(date, date, text, text), public.itqan_indicator_students(date, date, text, text) to anon, authenticated;
revoke all on function itqan.indicators_allowed(), itqan.school_year_start() from public, anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 058: مؤشرات المدرسة بالتفصيل' as result;
