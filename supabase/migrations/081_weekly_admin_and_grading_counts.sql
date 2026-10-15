-- =====================================================================
-- منصة إتقان: 081 — عدّاد التصحيح للتسليمات القديمة + التقرير الأسبوعي للإدارة
--  1) itqan_ungraded_old: عدد الإجابات المقالية غير المصححة في التسليمات الأقدم من 30 يوماً
--     (التي لا تُحمَّل إجاباتها تلقائياً منذ 079)، فيبقى عدّاد «التصحيح» دقيقاً دون تحميلها.
--  2) التقرير الأسبوعي للإدارة: ملخص الأسبوع (الاختبارات والمشاركة والمتوسط مقارنة بالأسبوع السابق،
--     أفضل الفصول، أضعف نواتج التعلم، أنشط المعلمين، الغياب) يصل إشعاراً للمدير
--     في الموعد الذي يختاره (افتراضياً الخميس 13:30)، ويُعرض أيضاً داخل المنصة.
--
-- يتطلب 053 و079. آمن لإعادة التشغيل.
-- =====================================================================

-- ---------- 1) عدّاد المقالي غير المصححة في التسليمات القديمة ----------
create or replace function public.itqan_ungraded_old(p_before timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_branch text := itqan.my_branch();
begin
  if not coalesce(itqan.is_staff(), false) then return null; end if;
  return coalesce((
    select jsonb_object_agg(x.id, x.n) from (
      select s.id::text id, count(*) n
      from public.submissions s
      join public.quizzes q on q.id::text = s.quiz_id::text
      cross join lateral jsonb_array_elements(case when jsonb_typeof(s.answers_json) = 'array' then s.answers_json else '[]'::jsonb end) a
      join lateral (select e from jsonb_array_elements(case when jsonb_typeof(q.questions) = 'array' then q.questions else '[]'::jsonb end) e
                    where e ->> 'id' = a ->> 'question_id' limit 1) qq on true
      where s.updated_at < p_before
        and coalesce(q.is_deleted, false) = false
        and q.questions::text like '%"essay"%'
        and (v_branch is null or itqan.user_branch(s.student_id::text) = v_branch)
        and (
          (qq.e ->> 'type' = 'essay' and not coalesce((a ->> 'graded')::boolean, false)
             and btrim(regexp_replace(coalesce(a ->> 'text_answer', ''), '<[^>]*>', '', 'g')) <> '')
          or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(qq.e -> 'sub_questions') = 'array' then qq.e -> 'sub_questions' else '[]'::jsonb end) sq
            join jsonb_array_elements(case when jsonb_typeof(a -> 'sub_answers') = 'array' then a -> 'sub_answers' else '[]'::jsonb end) sa
              on sa ->> 'sub_question_id' = sq ->> 'id'
            where sq ->> 'type' = 'essay' and not coalesce((sa ->> 'graded')::boolean, false)
              and btrim(regexp_replace(coalesce(sa ->> 'text_answer', ''), '<[^>]*>', '', 'g')) <> '')
        )
      group by s.id
    ) x), '{}'::jsonb);
end $$;

revoke all on function public.itqan_ungraded_old(timestamptz) from public;
grant execute on function public.itqan_ungraded_old(timestamptz) to anon, authenticated;

-- ---------- 2) التقرير الأسبوعي للإدارة ----------
create or replace function itqan.weekly_admin_data(p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := ((p_day - 6)::timestamp at time zone 'Asia/Riyadh');
  v_to   timestamptz := ((p_day + 1)::timestamp at time zone 'Asia/Riyadh');
  v_pfrom timestamptz := v_from - interval '7 days';
  v_students int := (select count(*) from public.users where role::text = 'student');
begin
  return jsonb_build_object(
    'from', p_day - 6, 'to', p_day, 'students', v_students,
    'quizzes_new', (select count(*) from public.quizzes q where coalesce(q.is_deleted, false) = false
                     and q.created_at >= v_from and q.created_at < v_to),
    'submissions', (select count(*) from public.submissions s where s.completed_at >= v_from and s.completed_at < v_to
                     and coalesce(s.status, 'completed') = 'completed'),
    'participants', (select count(distinct s.student_id) from public.submissions s where s.completed_at >= v_from and s.completed_at < v_to),
    'avg', (select round(avg(s.percentage)) from public.submissions s where s.completed_at >= v_from and s.completed_at < v_to
             and coalesce(s.status, 'completed') = 'completed'),
    'prev_avg', (select round(avg(s.percentage)) from public.submissions s where s.completed_at >= v_pfrom and s.completed_at < v_from
             and coalesce(s.status, 'completed') = 'completed'),
    'excellent', (select count(distinct s.student_id) from public.submissions s where s.completed_at >= v_from and s.completed_at < v_to and s.percentage >= 90),
    'top_classes', coalesce((
      select jsonb_agg(x order by x.avg desc) from (
        select c.id, c.name, round(avg(s.percentage)) avg, count(*) n
          from public.submissions s join public.users u on u.id::text = s.student_id::text
          join public.classes c on c.id::text = u.class_id::text
         where s.completed_at >= v_from and s.completed_at < v_to and coalesce(s.status, 'completed') = 'completed'
         group by c.id, c.name having count(*) >= 5
         order by avg(s.percentage) desc limit 3) x), '[]'::jsonb),
    'weak_outcomes', coalesce((
      select jsonb_agg(x order by x.pct) from (
        select qq.e ->> 'outcome' outcome, sub.name subject,
               round(100 * sum(coalesce(nullif(a ->> 'marks_awarded', '')::numeric, 0)) / nullif(sum(coalesce(nullif(qq.e ->> 'marks', '')::numeric, 0)), 0)) pct,
               count(*) n
          from public.submissions s
          join public.quizzes q on q.id::text = s.quiz_id::text
          left join public.subjects sub on sub.id::text = q.subject_id::text
          cross join lateral jsonb_array_elements(case when jsonb_typeof(s.answers_json) = 'array' then s.answers_json else '[]'::jsonb end) a
          join lateral (select e from jsonb_array_elements(case when jsonb_typeof(q.questions) = 'array' then q.questions else '[]'::jsonb end) e
                        where e ->> 'id' = a ->> 'question_id' limit 1) qq on true
         where s.completed_at >= v_from and s.completed_at < v_to
           and nullif(btrim(qq.e ->> 'outcome'), '') is not null and qq.e ->> 'type' not in ('essay', 'passage')
         group by 1, 2 having count(*) >= 10
         order by 3 asc nulls last limit 3) x where x.pct < 70), '[]'::jsonb),
    'active_teachers', coalesce((
      select jsonb_agg(x order by x.score desc) from (
        select u.id, u.name,
               count(distinct q.id) filter (where q.created_at >= v_from and q.created_at < v_to) quizzes,
               count(s.id) subs,
               count(distinct q.id) filter (where q.created_at >= v_from and q.created_at < v_to) * 10 + count(s.id) score
          from public.users u
          join public.quizzes q on q.teacher_id::text = u.id::text and coalesce(q.is_deleted, false) = false
          left join public.submissions s on s.quiz_id::text = q.id::text and s.completed_at >= v_from and s.completed_at < v_to
         where u.role::text = 'teacher'
         group by u.id, u.name
        having count(s.id) > 0 or count(distinct q.id) filter (where q.created_at >= v_from and q.created_at < v_to) > 0
         order by 5 desc limit 3) x), '[]'::jsonb),
    'absences', (select count(*) from public.attendance_records a where a.kind = 'absent' and a.day between p_day - 6 and p_day)
  );
exception when undefined_table or undefined_column then
  return null;
end $$;

create or replace function public.itqan_weekly_admin_report(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(itqan.is_admin() or itqan.my_role() = 'supervisor', false) then return null; end if;
  return itqan.weekly_admin_data(coalesce(p_day, (now() at time zone 'Asia/Riyadh')::date));
end $$;
revoke all on function public.itqan_weekly_admin_report(date) from public;
grant execute on function public.itqan_weekly_admin_report(date) to anon, authenticated;

create or replace function itqan.weekly_admin_notify()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Asia/Riyadh')::date;
  cfg jsonb := coalesce((select value from public.app_settings where key = 'weekly_admin'), '{}'::jsonb);
  d jsonb; v_body text; v_roles jsonb; v_trend text;
begin
  if coalesce((cfg ->> 'enabled')::boolean, true) = false then return 'disabled'; end if;
  v_roles := case when jsonb_typeof(cfg -> 'roles') = 'array' and jsonb_array_length(cfg -> 'roles') > 0 then cfg -> 'roles' else '["admin"]'::jsonb end;
  d := itqan.weekly_admin_data(v_day);
  if d is null then return 'no_data'; end if;
  v_trend := case when d ->> 'avg' is null or d ->> 'prev_avg' is null then ''
                  when (d ->> 'avg')::int > (d ->> 'prev_avg')::int then ' (↑ من ' || (d ->> 'prev_avg') || '%)'
                  when (d ->> 'avg')::int < (d ->> 'prev_avg')::int then ' (↓ من ' || (d ->> 'prev_avg') || '%)'
                  else ' (ثابت)' end;
  v_body := concat_ws(E'\n',
    '• ' || (d ->> 'submissions') || ' مشاركة من ' || (d ->> 'participants') || ' طالب'
      || case when (d ->> 'students')::int > 0 then ' (' || round(100.0 * (d ->> 'participants')::int / (d ->> 'students')::int) || '% من الطلاب)' else '' end
      || '، و' || (d ->> 'quizzes_new') || ' اختبار جديد',
    case when d ->> 'avg' is not null then '• متوسط النتائج ' || (d ->> 'avg') || '%' || v_trend || '، و' || (d ->> 'excellent') || ' طالب حصل على «ممتاز»' end,
    case when jsonb_array_length(d -> 'top_classes') > 0 then '• أفضل الفصول: ' ||
      (select string_agg((x ->> 'name') || ' ' || (x ->> 'avg') || '%', '، ') from jsonb_array_elements(d -> 'top_classes') x) end,
    case when jsonb_array_length(d -> 'weak_outcomes') > 0 then '• تحتاج علاجاً: ' ||
      (select string_agg((x ->> 'outcome') || ' (' || (x ->> 'pct') || '%)', '، ') from jsonb_array_elements(d -> 'weak_outcomes') x) end,
    case when jsonb_array_length(d -> 'active_teachers') > 0 then '• أنشط المعلمين: ' ||
      (select string_agg(x ->> 'name', '، ') from jsonb_array_elements(d -> 'active_teachers') x) end,
    case when (d ->> 'absences')::int > 0 then '• حالات الغياب هذا الأسبوع: ' || (d ->> 'absences') end);
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-wa-' || to_char(v_day, 'YYYYMMDD') || '-' || encode(extensions.gen_random_bytes(3), 'hex'), 'announcement',
          'التقرير الأسبوعي للمدرسة', v_body, jsonb_build_object('roles', v_roles), 'weekly_admin', to_char(v_day, 'YYYY-MM-DD'), null, 'منصة إتقان');
  return 'sent';
end $$;
revoke all on function itqan.weekly_admin_notify(), itqan.weekly_admin_data(date) from public, anon, authenticated;

-- الجدولة: نفس دالة 053 مع إضافة التقرير الأسبوعي للإدارة
create or replace function itqan.auto_tick()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Riyadh';
  v_day date := v_now::date;
  v_t time := v_now::time;
  ms jsonb := coalesce((select value from public.app_settings where key = 'morning_summary'), '{}'::jsonb);
  wr jsonb := coalesce((select value from public.app_settings where key = 'weekly_report'), '{}'::jsonb);
  wa jsonb := coalesce((select value from public.app_settings where key = 'weekly_admin'), '{}'::jsonb);
  t_ms time := itqan.cfg_time(ms ->> 'time', '06:45');
  t_wr time := itqan.cfg_time(wr ->> 'time', '14:40');
  d_wr int := coalesce(nullif(wr ->> 'day', '')::int, 4);
  t_wa time := itqan.cfg_time(wa ->> 'time', '13:30');
  d_wa int := coalesce(nullif(wa ->> 'day', '')::int, 4);
  out text := '';
  r text;
begin
  -- ملخص الصباح
  if v_t >= t_ms and v_t < t_ms + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'morning_summary'), '-infinity') < v_day then
    r := itqan.morning_digest_notify();
    insert into itqan.auto_runs values ('morning_summary', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'morning:' || r || ' ';
  end if;
  -- التقرير الأسبوعي لأولياء الأمور (extract(dow): الأحد = 0)
  if extract(dow from v_day)::int = d_wr and v_t >= t_wr and v_t < t_wr + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'weekly_report'), '-infinity') < v_day then
    r := itqan.weekly_parent_notify();
    insert into itqan.auto_runs values ('weekly_report', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'weekly:' || r || ' ';
  end if;
  -- التقرير الأسبوعي للإدارة
  if extract(dow from v_day)::int = d_wa and v_t >= t_wa and v_t < t_wa + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'weekly_admin'), '-infinity') < v_day then
    r := itqan.weekly_admin_notify();
    insert into itqan.auto_runs values ('weekly_admin', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'admin:' || r;
  end if;
  return nullif(btrim(out), '');
end $$;
revoke all on function itqan.auto_tick() from public, anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 081: عدّاد التصحيح للتسليمات القديمة + التقرير الأسبوعي للإدارة' as result;
