-- =====================================================================
-- منصة إتقان: 051 — التقرير الأسبوعي لولي الأمر
--  - itqan_weekly_report(طالب، يوم): ملخص أسبوع الطالب (الأحد–الخميس): الحضور، الاختبارات ومعدلها
--    والفائتة، الواجبات، السلوك، النقاط، الدعم الأكاديمي. لولي الأمر (أبناؤه) والطالب نفسه والطاقم.
--  - itqan.weekly_parent_notify(): إشعار لكل ولي أمر عن كل ابن (يصل للجوال عبر إشعارات الدفع)،
--    ويستدعيه سير عمل «Weekly parent report» كل خميس.
--  - الإعداد: app_settings.weekly_report = { enabled } (افتراضياً مفعّل).
--
-- يتطلب 003 و021 و022 و031 و040 و042 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.weekly_report_data(p_student text, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date := p_day - (extract(isodow from p_day)::int % 7); -- الأحد
  v_end date := v_start + 4;                                    -- الخميس
  t0 timestamptz; t1 timestamptz;
  u public.users;
  v jsonb;
begin
  select * into u from public.users where id = p_student and role::text = 'student';
  if not found then return null; end if;
  t0 := (v_start::timestamp at time zone 'Asia/Riyadh');
  t1 := ((v_end + 1)::timestamp at time zone 'Asia/Riyadh');

  with best as (
    select distinct on (s.quiz_id) s.quiz_id, q.title, s.percentage, s.completed_at,
           nullif(to_jsonb(q) ->> 'pass_percentage', '')::numeric pass
      from public.submissions s join public.quizzes q on q.id::text = s.quiz_id::text
     where s.student_id = p_student and not coalesce(q.is_deleted, false)
       and s.completed_at >= t0 and s.completed_at < t1
     order by s.quiz_id, s.percentage desc nulls last, s.completed_at
  ), missed as (
    select q.id, q.title from public.quizzes q
     where not coalesce(q.is_deleted, false) and q.status = 'published'
       and q.end_date >= t0 and q.end_date < least(t1, now())
       and itqan.quiz_targets_student(q, u)
       and not exists (select 1 from public.submissions s where s.quiz_id::text = q.id::text and s.student_id = p_student)
  ), hw as (
    select h.id, h.title, h.due_at, s.submitted_at
      from public.homework h
      left join public.homework_submissions s on s.homework_id = h.id and s.student_id = p_student
     where h.class_id = u.class_id and coalesce(h.allow_submission, true) and h.due_at >= t0 and h.due_at < t1
  ), pts as (
    select itqan.result_points(percentage, pass) p from best
    union all
    select a.points from public.student_awards a where a.student_id = p_student and a.created_at >= t0 and a.created_at < t1
  )
  select jsonb_build_object(
    'student_id', u.id, 'name', u.name, 'gender', u.gender,
    'week_start', v_start, 'week_end', v_end,
    'absent', (select count(*) from public.attendance_records where student_id = p_student and day between v_start and v_end and kind = 'absent'),
    'late', (select count(*) from public.attendance_records where student_id = p_student and day between v_start and v_end and kind = 'late'),
    'excused', (select count(*) from public.attendance_records where student_id = p_student and day between v_start and v_end and kind = 'excused'),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('id', quiz_id, 'title', title, 'pct', round(percentage), 'passed', coalesce(percentage, 0) >= coalesce(nullif(pass, 0), 50)) order by completed_at) from best), '[]'::jsonb),
    'quiz_avg', (select round(avg(percentage)) from best),
    'missed', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title)) from missed), '[]'::jsonb),
    'homework_due', (select count(*) from hw),
    'homework_done', (select count(*) from hw where submitted_at is not null),
    'homework_missing', coalesce((select jsonb_agg(title) from hw where submitted_at is null and due_at < now()), '[]'::jsonb),
    'behavior_pos', (select count(*) from public.behavior_records where student_id = p_student and day between v_start and v_end and kind = 'positive'),
    'behavior_neg', (select count(*) from public.behavior_records where student_id = p_student and day between v_start and v_end and kind = 'violation'),
    'behavior_notes', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'positive', kind = 'positive', 'day', day) order by day) from public.behavior_records where student_id = p_student and day between v_start and v_end), '[]'::jsonb),
    'points', (select coalesce(sum(p), 0)::int from pts),
    'support', coalesce((select jsonb_agg(jsonb_build_object('current', a.current_level, 'target', a.target_level, 'start', a.start_level,
                 'entries', (select count(*) from public.academic_support_progress p where p.support_id = a.id and p.at between v_start and v_end)))
               from public.academic_support a where a.student_id = p_student and a.status = 'active'), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- لولي الأمر (أبناؤه) والطالب نفسه والطاقم
create or replace function public.itqan_weekly_report(p_student text, p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if itqan.uid() is null then return null; end if;
  if not (p_student = itqan.uid() or p_student = any(itqan.my_children())
          or itqan.is_admin() or itqan.my_role() in ('supervisor', 'teacher')) then return null; end if;
  return itqan.weekly_report_data(p_student, coalesce(p_day, (now() at time zone 'Asia/Riyadh')::date));
end $$;

-- نص الإشعار من بيانات التقرير
create or replace function itqan.weekly_report_text(d jsonb)
returns text language sql immutable set search_path = '' as $$
  select concat_ws(E'\n',
    '• الحضور: ' || case when (d ->> 'absent')::int + (d ->> 'late')::int + (d ->> 'excused')::int = 0 then 'منتظم طوال الأسبوع ✓'
      else concat_ws('، ', nullif((d ->> 'absent') || ' غياب', '0 غياب'), nullif((d ->> 'late') || ' تأخر', '0 تأخر'), nullif((d ->> 'excused') || ' استئذان', '0 استئذان')) end,
    case when jsonb_array_length(d -> 'quizzes') > 0 then '• الاختبارات: ' || jsonb_array_length(d -> 'quizzes') || ' بمعدل ' || (d ->> 'quiz_avg') || '%' end,
    case when jsonb_array_length(d -> 'missed') > 0 then '• اختبارات فائتة: ' || (select string_agg(x ->> 'title', '، ') from jsonb_array_elements(d -> 'missed') x) end,
    case when (d ->> 'homework_due')::int > 0 then '• الواجبات: سلّم ' || (d ->> 'homework_done') || ' من ' || (d ->> 'homework_due') end,
    case when (d ->> 'behavior_pos')::int + (d ->> 'behavior_neg')::int > 0 then '• السلوك: ' || concat_ws('، ', nullif((d ->> 'behavior_pos') || ' إيجابي', '0 إيجابي'), nullif((d ->> 'behavior_neg') || ' ملاحظة', '0 ملاحظة')) end,
    case when jsonb_array_length(d -> 'support') > 0 then '• الدعم الأكاديمي: المستوى الآن ' || (d -> 'support' -> 0 ->> 'current') || '% والهدف ' || (d -> 'support' -> 0 ->> 'target') || '%' end,
    '• النقاط هذا الأسبوع: ' || (d ->> 'points'));
$$;

-- الإشعار الأسبوعي (يستدعيه سير العمل المجدول بصلاحية قاعدة البيانات)
create or replace function itqan.weekly_parent_notify()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Asia/Riyadh')::date;
  cfg jsonb := coalesce((select value from public.app_settings where key = 'weekly_report'), '{}'::jsonb);
  r record; d jsonb; n int := 0;
begin
  if coalesce((cfg ->> 'enabled')::boolean, true) = false then return 'disabled'; end if;
  for r in
    select p.id parent_id, c.id child_id
      from public.users p cross join lateral jsonb_array_elements_text(coalesce(p.child_ids, '[]'::jsonb)) cid
      join public.users c on c.id = cid and c.role::text = 'student'
     where p.role::text = 'parent'
  loop
    d := itqan.weekly_report_data(r.child_id, v_day);
    if d is null then continue; end if;
    insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
    values ('ntf-wr-' || to_char(v_day, 'YYYYMMDD') || '-' || encode(extensions.gen_random_bytes(5), 'hex'), 'announcement',
            'التقرير الأسبوعي: ' || (d ->> 'name'), itqan.weekly_report_text(d),
            jsonb_build_object('user_ids', jsonb_build_array(r.parent_id)), 'weekly_report', r.child_id, null, 'منصة إتقان');
    n := n + 1;
  end loop;
  return 'sent ' || n;
end $$;

revoke all on function public.itqan_weekly_report(text, date) from public;
grant execute on function public.itqan_weekly_report(text, date) to anon, authenticated;
revoke all on function itqan.weekly_parent_notify(), itqan.weekly_report_data(text, date) from public, anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 051: التقرير الأسبوعي لولي الأمر' as result;
