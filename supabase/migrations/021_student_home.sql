-- =====================================================================
-- منصة إتقان: 021 — الرئيسية الجديدة للطالب (تحدي اليوم، أيام متتالية، ترتيب الفصل)
--  - تحدي اليوم: أسئلة قصيرة (اختيار من متعدد وصح/خطأ) من بنك الأسئلة المشترك في مواد الطالب.
--    * الأسئلة تُرسَل بلا إجابات، والتصحيح على الخادم فقط. محاولة واحدة في اليوم (بتوقيت الرياض).
--    * نقاط التحدي تُسجَّل كجائزة من النظام (source = 'daily_challenge') فتُحسب في كل مكان تُحسب فيه النقاط.
--  - الأيام المتتالية: كل يوم حلّ فيه الطالب تحدي اليوم أو أدّى اختباراً.
--  - ترتيب الفصل: نقاط آخر 7 أيام لطلاب فصل الطالب (نفس قواعد حساب النقاط في المنصة).
--  - المدير يتحكم من الإعدادات (student_home): تشغيل/إيقاف كل جزء وعدد أسئلة التحدي.
--
-- يتطلب 003 و009 و015 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

-- مصدر الجائزة: staff (يمنحها المعلم) أو daily_challenge (من النظام)
alter table public.student_awards add column if not exists source text not null default 'staff';

create table if not exists public.daily_challenge_attempts (
  student_id   text not null,
  day          date not null,
  question_ids text[] not null default '{}',
  answers      jsonb not null default '[]'::jsonb,
  correct      integer not null default 0,
  total        integer not null default 0,
  points       integer not null default 0,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (student_id, day)
);
create index if not exists daily_challenge_day_idx on public.daily_challenge_attempts (day);

alter table public.daily_challenge_attempts enable row level security;
revoke all on public.daily_challenge_attempts from public, anon, authenticated;
grant select on public.daily_challenge_attempts to anon, authenticated;
-- الطالب يقرأ محاولاته، والإدارة تقرأ الكل. الكتابة عبر الدوال فقط.
drop policy if exists daily_challenge_select on public.daily_challenge_attempts;
create policy daily_challenge_select on public.daily_challenge_attempts for select to anon, authenticated
  using (student_id = (select itqan.uid()) or (select itqan.is_staff()));

-- إعدادات الرئيسية (مع القيم الافتراضية)
create or replace function itqan.student_home_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('challenge', true, 'streak', true, 'leaderboard', true, 'challenge_count', 5)
         || coalesce((select s.value from public.app_settings s where s.key = 'student_home' and jsonb_typeof(s.value) = 'object'), '{}'::jsonb);
$$;

create or replace function itqan.riyadh_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Riyadh')::date;
$$;

-- نقاط اختبار حسب النسبة (مطابقة لـ pointsForResult في الواجهة)
create or replace function itqan.result_points(p_pct numeric, p_pass numeric)
returns integer language sql immutable set search_path = '' as $$
  select 10 + round(coalesce(p_pct, 0) / 5)::int
       + case when coalesce(p_pct, 0) >= coalesce(nullif(p_pass, 0), 50) then 5 else 0 end
       + case when coalesce(p_pct, 0) >= 100 then 15 else 0 end;
$$;

-- السؤال كما يراه الطالب: بلا إجابة ولا شرح
create or replace function itqan.challenge_question(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'type', b.type,
    'question_text', coalesce(b.question ->> 'question_text', b.question ->> 'text', ''),
    'options', coalesce(b.question -> 'options', '[]'::jsonb),
    'subject_id', b.subject_id,
    'subject_name', sj.name, 'subject_color', sj.color)
  from public.question_bank b left join public.subjects sj on sj.id::text = b.subject_id
  where b.id = p_id;
$$;

-- ---------------------------------------------------------------------
-- بيانات الرئيسية: الإعدادات، حالة تحدي اليوم، الأيام المتتالية، ترتيب الفصل
-- ---------------------------------------------------------------------
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

  -- أسئلة متاحة لتحدي اليوم في مواد الطالب
  if (v_cfg ->> 'challenge')::boolean then
    select count(*) into v_available from public.question_bank b
    where b.shared and b.type in ('mcq', 'true_false')
      and b.subject_id in (select distinct q ->> 'subject_id' from itqan.quizzes_for_student(v_me) q)
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
        and coalesce(to_jsonb(u) ->> 'branch_id', '') = coalesce(to_jsonb(v_me) ->> 'branch_id', '')
    ), best as (
      select distinct on (s.student_id, s.quiz_id) s.student_id::text sid, s.percentage, s.completed_at,
             nullif(to_jsonb(q) ->> 'pass_percentage', '')::numeric pass
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

-- ---------------------------------------------------------------------
-- بدء تحدي اليوم: تُثبَّت الأسئلة لليوم وتُرسَل بلا إجابات
-- ---------------------------------------------------------------------
create or replace function public.itqan_daily_challenge()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me public.users;
  v_cfg jsonb := itqan.student_home_settings();
  v_today date := itqan.riyadh_today();
  v_att public.daily_challenge_attempts;
  v_n int := least(greatest(coalesce((v_cfg ->> 'challenge_count')::int, 5), 3), 10);
  v_ids text[];
begin
  select * into v_me from public.users where id::text = itqan.uid() and role::text = 'student';
  if not found then raise exception 'not_student'; end if;
  if not (v_cfg ->> 'challenge')::boolean then raise exception 'challenge_disabled'; end if;

  select * into v_att from public.daily_challenge_attempts where student_id = v_me.id and day = v_today;
  if found and v_att.completed_at is not null then raise exception 'already_done'; end if;

  if not found then
    -- أسئلة لم تظهر له من قبل أولاً، ثم ترتيب ثابت لليوم والفصل
    select array_agg(id) into v_ids from (
      select b.id from public.question_bank b
      where b.shared and b.type in ('mcq', 'true_false')
        and b.subject_id in (select distinct q ->> 'subject_id' from itqan.quizzes_for_student(v_me) q)
        and jsonb_typeof(b.question -> 'options') = 'array' and jsonb_array_length(b.question -> 'options') >= 2
        and (b.question ->> 'correct_option_index') ~ '^\d+$'
      order by exists(select 1 from public.daily_challenge_attempts a where a.student_id = v_me.id and b.id = any(a.question_ids)),
               md5(b.id || v_today::text || coalesce(v_me.class_id, ''))
      limit v_n
    ) t;
    if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'no_questions'; end if;
    insert into public.daily_challenge_attempts (student_id, day, question_ids)
    values (v_me.id, v_today, v_ids)
    on conflict (student_id, day) do nothing
    returning * into v_att;
    if v_att is null then
      select * into v_att from public.daily_challenge_attempts where student_id = v_me.id and day = v_today;
    end if;
  end if;

  -- الوقت يُحسب من أول فتح (إعادة الفتح لا تُصفّر العدّاد)
  return jsonb_build_object('day', v_att.day,
    'seconds', greatest(0, 24 * array_length(v_att.question_ids, 1) - floor(extract(epoch from now() - v_att.started_at))::int),
    'questions', (select coalesce(jsonb_agg(itqan.challenge_question(x) order by o), '[]'::jsonb)
                  from unnest(v_att.question_ids) with ordinality u(x, o)));
end $$;

-- ---------------------------------------------------------------------
-- تسليم تحدي اليوم: التصحيح على الخادم، 3 نقاط لكل إجابة صحيحة + 5 لإكمال التحدي
-- p_answers: مصفوفة بنفس ترتيب الأسئلة، كل عنصر رقم الاختيار (أو null). الوقت: 24 ثانية لكل سؤال.
-- ---------------------------------------------------------------------
create or replace function public.itqan_submit_daily_challenge(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me public.users;
  v_today date := itqan.riyadh_today();
  v_att public.daily_challenge_attempts;
  v_res jsonb := '[]'::jsonb;
  v_correct int := 0; v_total int := 0; v_points int;
  v_q jsonb; v_ans text; v_ok boolean; i int;
begin
  select * into v_me from public.users where id::text = itqan.uid() and role::text = 'student';
  if not found then raise exception 'not_student'; end if;
  select * into v_att from public.daily_challenge_attempts where student_id = v_me.id and day = v_today for update;
  if not found then raise exception 'not_started'; end if;
  if v_att.completed_at is not null then raise exception 'already_done'; end if;
  if jsonb_typeof(p_answers) <> 'array' then p_answers := '[]'::jsonb; end if;
  -- بعد انتهاء الوقت (مع مهلة 15 ثانية للاتصال) لا تُقبل الإجابات
  if now() > v_att.started_at + make_interval(secs => 24 * coalesce(array_length(v_att.question_ids, 1), 0) + 15) then
    p_answers := '[]'::jsonb;
  end if;

  for i in 1..coalesce(array_length(v_att.question_ids, 1), 0) loop
    select b.question into v_q from public.question_bank b where b.id = v_att.question_ids[i];
    v_ans := p_answers ->> (i - 1);
    v_ok := v_q is not null and v_ans is not null and v_ans = (v_q ->> 'correct_option_index');
    v_total := v_total + 1;
    if v_ok then v_correct := v_correct + 1; end if;
    v_res := v_res || jsonb_build_object('id', v_att.question_ids[i], 'answer', v_ans, 'correct', v_ok,
      'correct_option_index', (v_q ->> 'correct_option_index')::int, 'explanation', coalesce(v_q ->> 'explanation', ''));
  end loop;

  v_points := v_correct * 3 + case when v_total > 0 then 5 else 0 end;
  update public.daily_challenge_attempts
     set answers = coalesce(p_answers, '[]'::jsonb), correct = v_correct, total = v_total, points = v_points, completed_at = now()
   where student_id = v_me.id and day = v_today;

  insert into public.student_awards (id, student_id, student_name, class_name, title, note, points, awarded_by, awarded_by_name, created_at, source)
  values ('dc-' || v_me.id || '-' || v_today, v_me.id, v_me.name,
          coalesce((select c.name from public.classes c where c.id::text = v_me.class_id), ''),
          'تحدي اليوم', v_correct || '/' || v_total, v_points, 'system', 'تحدي اليوم', now(), 'daily_challenge')
  on conflict (id) do nothing;

  return jsonb_build_object('correct', v_correct, 'total', v_total, 'points', v_points, 'results', v_res);
end $$;

-- ---------------------------------------------------------------------
-- نقاط تحدي اليوم بشكل الجوائز، مجمّعة حتى لا تُثقل التحميل:
--  الطالب: محاولاته كلها. ولي الأمر: أبناؤه. الإدارة: طلاب فرعها، آخر 7 أيام يوماً بيوم،
--  وما قبلها صفّان لكل طالب (8–30 يوماً، وأقدم من 30) لتبقى فترات «أسبوع/شهر/الكل» صحيحة.
-- ---------------------------------------------------------------------
create or replace function public.itqan_challenge_awards()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := itqan.my_role(); v_branch text := itqan.my_branch();
begin
  if itqan.uid() is null then return; end if;
  if v_role in ('student', 'parent') then
    return query
      select to_jsonb(a) from public.student_awards a
      where a.source = 'daily_challenge'
        and (a.student_id = itqan.uid() or a.student_id = any(itqan.my_children()));
    return;
  end if;
  if not itqan.is_staff() then return; end if;
  return query
    with mine as (
      select a.* from public.student_awards a
      join public.users u on u.id::text = a.student_id
      where a.source = 'daily_challenge' and (v_branch is null or u.branch_id = v_branch)
    )
    select to_jsonb(m) from mine m where m.created_at >= now() - interval '7 days'
    union all
    select jsonb_build_object('id', 'dc-agg-' || g.bucket || '-' || g.student_id, 'student_id', g.student_id,
             'student_name', g.student_name, 'class_name', g.class_name, 'title', 'تحدي اليوم',
             'note', '', 'points', g.points, 'awarded_by', 'system', 'awarded_by_name', 'تحدي اليوم',
             'created_at', g.created_at, 'source', 'daily_challenge')
    from (
      select m.student_id, max(m.student_name) student_name, max(m.class_name) class_name,
             case when m.created_at >= now() - interval '30 days' then 'm' else 'o' end bucket,
             sum(m.points)::int points, max(m.created_at) created_at
      from mine m where m.created_at < now() - interval '7 days'
      group by m.student_id, 4
    ) g;
end $$;

revoke execute on function itqan.student_home_settings(), itqan.challenge_question(text) from public, anon, authenticated;
revoke all on function public.itqan_student_home(), public.itqan_daily_challenge(), public.itqan_submit_daily_challenge(jsonb), public.itqan_challenge_awards() from public;
grant execute on function public.itqan_student_home(), public.itqan_daily_challenge(), public.itqan_submit_daily_challenge(jsonb), public.itqan_challenge_awards() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 021: الرئيسية الجديدة للطالب (تحدي اليوم والأيام المتتالية وترتيب الفصل)' as result;
