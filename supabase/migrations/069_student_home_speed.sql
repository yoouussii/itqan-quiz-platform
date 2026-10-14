-- =====================================================================
-- منصة إتقان: 069 — تسريع رئيسية الطالب وقائمة اختباراته وقت الزحمة
--  اختبار ضغط (500 طالب) أظهر أن itqan_student_home وحدها تستهلك معظم وقت قاعدة البيانات:
--  - كانت تجلب كل اختبارات الطالب كاملة بأسئلتها (quizzes_for_student) لمجرد معرفة موادها.
--  - ترتيب الفصل كان يحوّل صف الاختبار كاملاً (مع الأسئلة) إلى jsonb لكل تسليم لقراءة نسبة النجاح.
--  - quiz_targets_student و quizzes_for_student تحوّلان الصف كاملاً إلى jsonb لقراءة أعمدة موجودة.
--  نفس النتائج تماماً، بقراءة الأعمدة مباشرة.
--
-- يتطلب 003 و021. آمن لإعادة التشغيل.
-- =====================================================================

-- هل الاختبار موجّه لهذا الطالب؟ (نفس منطق 003 بقراءة الأعمدة مباشرة)
create or replace function itqan.quiz_targets_student(q public.quizzes, p_student public.users)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  asg jsonb := coalesce(q.assignments, '[]'::jsonb);
  a jsonb;
  my_classes text[];
begin
  my_classes := array_remove(
    array[p_student.class_id::text] ||
    coalesce(array(select jsonb_array_elements_text(coalesce(p_student.assigned_class_ids, '[]'::jsonb))), '{}'),
    null);

  if jsonb_typeof(asg) <> 'array' or jsonb_array_length(asg) = 0 then
    -- صفوف قديمة بلا assignments
    asg := jsonb_build_array(jsonb_build_object(
      'target_type', coalesce(q.target_type, 'all'),
      'target_id', case
        when q.target_type = 'class' then q.class_id
        when q.target_type = 'specific_students' then array_to_string(q.student_ids, ',')
      end));
  end if;

  for a in select * from jsonb_array_elements(asg) loop
    if a ->> 'target_type' = 'all' then return true; end if;
    if a ->> 'target_type' = 'class' and (a ->> 'target_id') = any(my_classes) then return true; end if;
    if a ->> 'target_type' = 'specific_students'
       and p_student.id::text = any(string_to_array(replace(coalesce(a ->> 'target_id', ''), ' ', ''), ',')) then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- اختبارات الطالب المنشورة (نفس المخرجات؛ التصفية بالأعمدة بدل تحويل كل صف إلى jsonb)
create or replace function itqan.quizzes_for_student(p_student public.users)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare q public.quizzes; v_row jsonb; v_done boolean; v_retake boolean; v_tb text;
begin
  for q in
    select * from public.quizzes
    where coalesce(status, 'published') = 'published' and not coalesce(is_deleted, false)
  loop
    continue when not itqan.quiz_targets_student(q, p_student);
    -- اختبار معلم فرعٍ لا يصل لطلاب فرع آخر
    v_tb := itqan.user_branch(q.teacher_id);
    continue when v_tb is not null and nullif(p_student.branch_id, '') is not null and v_tb <> p_student.branch_id;
    v_row := to_jsonb(q);
    select exists(select 1 from public.submissions s
                  where s.quiz_id::text = q.id::text and s.student_id::text = p_student.id::text)
      into v_done;
    v_retake := p_student.id::text in (
      select jsonb_array_elements_text(coalesce(v_row -> 'allowed_retake_student_ids', '[]'::jsonb)));
    if not v_done or v_retake or not itqan.reveal_answers(v_row) then
      v_row := jsonb_set(v_row, '{questions}', itqan.strip_answers(v_row -> 'questions'));
    end if;
    v_row := v_row || jsonb_build_object('answers_revealed', v_done and not v_retake and itqan.reveal_answers(v_row));
    v_row := v_row || jsonb_build_object('teacher', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'role', t.role, 'job_title', to_jsonb(t) -> 'job_title')
      from public.users t where t.id::text = v_row ->> 'teacher_id'));
    return next v_row;
  end loop;
end $$;

-- رئيسية الطالب (021): نفس المخرجات
create or replace function public.itqan_student_home()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me public.users;
  v_cfg jsonb := itqan.student_home_settings();
  v_today date := itqan.riyadh_today();
  v_att public.daily_challenge_attempts;
  v_days date[];
  v_cur int := 0; v_long int := 0; v_run int := 0; v_prev date; d date;
  v_week jsonb := '[]'::jsonb;
  v_board jsonb := '[]'::jsonb;
  v_rank int; v_mypts int := 0;
  v_solved int := 0;
  v_available int := 0;
begin
  select * into v_me from public.users where id::text = itqan.uid() and role::text = 'student';
  if not found then return null; end if;

  select * into v_att from public.daily_challenge_attempts where student_id = v_me.id and day = v_today;

  -- أسئلة متاحة لتحدي اليوم في مواد الطالب (مواد اختباراته المنشورة، بلا جلب الاختبارات كاملة)
  if (v_cfg ->> 'challenge')::boolean then
    select count(*) into v_available from public.question_bank b
    where b.shared and b.type in ('mcq', 'true_false')
      and b.subject_id in (
        select distinct q.subject_id from public.quizzes q
        where coalesce(q.status, 'published') = 'published' and not coalesce(q.is_deleted, false)
          and itqan.quiz_targets_student(q, v_me)
          and (itqan.user_branch(q.teacher_id) is null or nullif(v_me.branch_id, '') is null
               or itqan.user_branch(q.teacher_id) = v_me.branch_id))
      and jsonb_typeof(b.question -> 'options') = 'array' and jsonb_array_length(b.question -> 'options') >= 2
      and (b.question ->> 'correct_option_index') ~ '^\d+$';
    select count(*) into v_solved from public.daily_challenge_attempts a
      join public.users u on u.id::text = a.student_id
    where a.day = v_today and a.completed_at is not null and u.class_id = v_me.class_id and u.id <> v_me.id;
  end if;

  -- الأيام النشطة: تحدي مكتمل أو اختبار مؤدّى
  select array_agg(x order by x) into v_days from (
    select a.day x from public.daily_challenge_attempts a where a.student_id = v_me.id and a.completed_at is not null
    union
    select (s.completed_at at time zone 'Asia/Riyadh')::date from public.submissions s
    where s.student_id::text = v_me.id::text and s.completed_at is not null
  ) t;
  foreach d in array coalesce(v_days, '{}') loop
    v_run := case when v_prev is not null and d = v_prev + 1 then v_run + 1 else 1 end;
    v_long := greatest(v_long, v_run);
    v_prev := d;
  end loop;
  -- السلسلة الحالية مستمرة إن كان آخر نشاط اليوم أو أمس
  if v_prev is not null and v_prev >= v_today - 1 then v_cur := v_run; end if;
  for i in reverse 6..0 loop
    v_week := v_week || jsonb_build_object('day', v_today - i, 'active', (v_today - i) = any(coalesce(v_days, '{}')));
  end loop;

  -- ترتيب الفصل: نقاط آخر 7 أيام (أفضل محاولة لكل اختبار + الجوائز)
  if (v_cfg ->> 'leaderboard')::boolean and nullif(v_me.class_id, '') is not null then
    with mates as (
      select u.id::text id, u.name from public.users u
      where u.role::text = 'student' and u.class_id = v_me.class_id
        and coalesce(u.branch_id, '') = coalesce(v_me.branch_id, '')
    ), best as (
      select distinct on (s.student_id, s.quiz_id) s.student_id::text sid, s.percentage, s.completed_at, q.pass_percentage pass
      from public.submissions s
      join public.quizzes q on q.id::text = s.quiz_id::text
      where s.student_id::text in (select id from mates) and not coalesce(q.is_deleted, false)
      order by s.student_id, s.quiz_id, s.percentage desc nulls last, s.completed_at
    ), pts as (
      select sid, itqan.result_points(percentage, pass) p from best where completed_at >= now() - interval '7 days'
      union all
      select a.student_id, a.points from public.student_awards a
      where a.student_id in (select id from mates) and a.created_at >= now() - interval '7 days'
    ), ranked as (
      select m.id, m.name, coalesce(sum(p.p), 0)::int points,
             rank() over (order by coalesce(sum(p.p), 0) desc) rnk,
             row_number() over (order by coalesce(sum(p.p), 0) desc, m.name) rn
      from mates m left join pts p on p.sid = m.id
      group by m.id, m.name
    )
    select coalesce(jsonb_agg(jsonb_build_object('rank', rnk, 'name', name, 'points', points, 'me', id = v_me.id::text) order by rn)
             filter (where rn <= 5), '[]'::jsonb),
           max(rnk) filter (where id = v_me.id::text),
           max(points) filter (where id = v_me.id::text)
      into v_board, v_rank, v_mypts
    from ranked;
  end if;

  return jsonb_build_object(
    'settings', v_cfg,
    'today', v_today,
    'challenge', jsonb_build_object(
      'enabled', (v_cfg ->> 'challenge')::boolean and v_available > 0,
      'count', least(greatest(coalesce((v_cfg ->> 'challenge_count')::int, 5), 3), 10),
      'done', v_att.completed_at is not null,
      'correct', coalesce(v_att.correct, 0), 'total', coalesce(v_att.total, 0), 'points', coalesce(v_att.points, 0),
      'solved_by_classmates', v_solved),
    'streak', jsonb_build_object('current', v_cur, 'longest', v_long, 'week', v_week),
    'leaderboard', v_board,
    'my_rank', v_rank, 'my_week_points', coalesce(v_mypts, 0));
end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 069: تسريع رئيسية الطالب وقائمة اختباراته' as result;
