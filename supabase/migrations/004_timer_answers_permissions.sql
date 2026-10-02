-- =====================================================================
-- منصة إتقان: 004 — مؤقت الاختبار على الخادم + إخفاء الإجابات حتى انتهاء الاختبار
--                 + صلاحيات تعديل الاختبارات
--
-- يتطلب تشغيل 003 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
--
--  1. وقت بدء كل محاولة يُسجَّل على الخادم: تحديث الصفحة أو تغيير الجهاز
--     يكمل نفس المؤقت ولا يعيده من البداية.
--  2. الإجابات النموذجية والشرح تظهر للطالب بعد انتهاء وقت إتاحة الاختبار
--     (وليس فور تسليمه) حتى لا تنتقل لزملائه الذين لم يختبروا بعد.
--  3. تواريخ الإتاحة القديمة (تاريخ بلا وقت) تُعامل كيوم كامل بتوقيت الرياض.
--  4. المعلم يعدّل اختباراته فقط؛ المدير ومن يملك صلاحية الاعتماد يعدّلون الكل،
--     ومن يملك صلاحية إعادة المحاولات يغيّر قائمة الإعادة فقط.
-- =====================================================================

-- ---------------------------------------------------------------------
-- بداية ونهاية الإتاحة (نفس منطق الموقع: التاريخ بلا وقت = اليوم كاملاً)
-- ---------------------------------------------------------------------
create or replace function itqan.window_start(p text)
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when nullif(p, '') is null then null
    when p ~ '^\d{4}-\d{2}-\d{2}$' or p ~ '^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00(:00)?)$'
      then (left(p, 10)::date::timestamp) at time zone 'Asia/Riyadh'
    else p::timestamptz
  end;
$$;

create or replace function itqan.window_end(p text)
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when nullif(p, '') is null then null
    when p ~ '^\d{4}-\d{2}-\d{2}$' or p ~ '^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00(:00)?)$'
      then ((left(p, 10)::date + 1)::timestamp at time zone 'Asia/Riyadh') - interval '1 millisecond'
    else p::timestamptz
  end;
$$;

-- تظهر الإجابات النموذجية بعد انتهاء الإتاحة (أو فوراً إن لم يكن للاختبار تاريخ نهاية)
create or replace function itqan.reveal_answers(p_quiz jsonb)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(itqan.window_end(p_quiz ->> 'end_date') < now(), true);
$$;

-- ---------------------------------------------------------------------
-- محاولات الاختبار الجارية (وقت البدء على الخادم)
-- ---------------------------------------------------------------------
create table if not exists itqan.quiz_attempts (
  student_id  text not null,
  quiz_id     text not null,
  started_at  timestamptz not null default now(),
  primary key (student_id, quiz_id)
);
alter table itqan.quiz_attempts enable row level security;
revoke all on itqan.quiz_attempts from public, anon, authenticated;

create or replace function public.itqan_start_quiz(p_quiz_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_student public.users; v_quiz public.quizzes; v_q jsonb;
  v_start timestamptz; v_end timestamptz; v_duration numeric;
  v_started timestamptz; v_done boolean; v_retake boolean; v_ends timestamptz;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role = 'student';
  if not found then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_quiz from public.quizzes where id::text = p_quiz_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'quiz_not_found'); end if;
  v_q := to_jsonb(v_quiz);

  if coalesce(v_q ->> 'status', 'published') <> 'published'
     or coalesce((v_q ->> 'is_deleted')::boolean, false)
     or not coalesce((v_q ->> 'is_active')::boolean, true)
     or not itqan.quiz_targets_student(v_quiz, v_student) then
    return jsonb_build_object('ok', false, 'error', 'quiz_not_available');
  end if;
  v_start := itqan.window_start(v_q ->> 'start_date');
  v_end := itqan.window_end(v_q ->> 'end_date');
  if v_start is not null and now() < v_start - interval '2 minutes' then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;
  if v_end is not null and now() > v_end then
    return jsonb_build_object('ok', false, 'error', 'ended');
  end if;

  select exists(select 1 from public.submissions s
                where s.quiz_id::text = p_quiz_id and s.student_id::text = v_student.id::text) into v_done;
  v_retake := v_student.id::text in (
    select jsonb_array_elements_text(coalesce(v_q -> 'allowed_retake_student_ids', '[]'::jsonb)));
  if v_done and not v_retake then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  -- محاولة جارية: نكمل بنفس وقت البدء (تحديث الصفحة لا يعيد المؤقت)
  select started_at into v_started from itqan.quiz_attempts
  where student_id = v_student.id::text and quiz_id = p_quiz_id;
  if v_started is null then
    insert into itqan.quiz_attempts (student_id, quiz_id, started_at)
    values (v_student.id::text, p_quiz_id, now())
    on conflict (student_id, quiz_id) do update set started_at = excluded.started_at
    returning started_at into v_started;
  end if;

  v_duration := coalesce(nullif(v_q ->> 'duration_minutes', '')::numeric, 30);
  v_ends := v_started + make_interval(secs => v_duration * 60);
  if v_end is not null and v_end < v_ends then v_ends := v_end; end if;

  return jsonb_build_object('ok', true, 'started_at', v_started, 'ends_at', v_ends, 'server_now', now());
end $$;

-- ---------------------------------------------------------------------
-- اختبارات الطالب: الإجابات مخفية حتى يسلّم وينتهي وقت الإتاحة
-- ---------------------------------------------------------------------
create or replace function public.itqan_student_quizzes()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_student public.users; q public.quizzes; v_row jsonb; v_done boolean; v_retake boolean;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role = 'student';
  if not found then return; end if;

  for q in
    select * from public.quizzes
    where coalesce(to_jsonb(quizzes) ->> 'status', 'published') = 'published'
      and not coalesce((to_jsonb(quizzes) ->> 'is_deleted')::boolean, false)
  loop
    continue when not itqan.quiz_targets_student(q, v_student);
    v_row := to_jsonb(q);
    select exists(select 1 from public.submissions s
                  where s.quiz_id::text = q.id::text and s.student_id::text = v_student.id::text)
      into v_done;
    v_retake := v_student.id::text in (
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

-- ---------------------------------------------------------------------
-- التسليم (نفس 003 مع: وقت البدء من الخادم، والإجابات بعد انتهاء الإتاحة)
-- ---------------------------------------------------------------------
create or replace function public.itqan_submit_quiz(
  p_quiz_id text, p_answers jsonb, p_time_spent integer, p_client_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_student public.users;
  v_quiz public.quizzes;
  v_q jsonb; v_quiz_json jsonb; v_questions jsonb;
  v_existing jsonb;
  v_retake boolean;
  q jsonb; a jsonb; sq jsonb; sa jsonb;
  v_graded jsonb := '[]'::jsonb; v_subs jsonb;
  v_score numeric := 0; v_total numeric := 0; v_awarded numeric; v_possible numeric; v_m numeric;
  v_sel int; v_ok boolean;
  v_row jsonb; v_inserted jsonb;
  v_start timestamptz; v_end timestamptz; v_duration numeric;
  v_started timestamptz; v_reveal boolean;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role = 'student';
  if not found then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;

  select * into v_quiz from public.quizzes where id::text = p_quiz_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'quiz_not_found'); end if;
  v_quiz_json := to_jsonb(v_quiz);

  if coalesce(v_quiz_json ->> 'status', 'published') <> 'published'
     or coalesce((v_quiz_json ->> 'is_deleted')::boolean, false)
     or not coalesce((v_quiz_json ->> 'is_active')::boolean, true)
     or not itqan.quiz_targets_student(v_quiz, v_student) then
    return jsonb_build_object('ok', false, 'error', 'quiz_not_available');
  end if;

  v_start := itqan.window_start(v_quiz_json ->> 'start_date');
  v_end := itqan.window_end(v_quiz_json ->> 'end_date');
  v_reveal := itqan.reveal_answers(v_quiz_json);
  v_duration := coalesce(nullif(v_quiz_json ->> 'duration_minutes', '')::numeric, 30);
  if v_start is not null and now() < v_start - interval '2 minutes' then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;
  -- مهلة 5 دقائق بعد نهاية الإتاحة (للتسليم التلقائي وبطء الشبكة)
  if v_end is not null and now() > v_end + interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'ended');
  end if;

  -- إعادة إرسال نفس المحاولة (انقطاع الشبكة): نعيد النتيجة المحفوظة
  if p_client_id is not null then
    select to_jsonb(s) into v_existing from public.submissions s
    where s.id::text = p_client_id and s.student_id::text = v_student.id::text;
    if v_existing is not null then
      return jsonb_build_object('ok', true, 'submission', v_existing, 'answers_revealed', v_reveal,
        'questions', case when v_reveal then v_quiz_json -> 'questions' else itqan.strip_answers(v_quiz_json -> 'questions') end);
    end if;
  end if;

  v_retake := v_student.id::text in (
    select jsonb_array_elements_text(coalesce(v_quiz_json -> 'allowed_retake_student_ids', '[]'::jsonb)));
  select to_jsonb(s) into v_existing from public.submissions s
  where s.quiz_id::text = p_quiz_id and s.student_id::text = v_student.id::text
  order by s.completed_at desc limit 1;
  if v_existing is not null and not v_retake then
    return jsonb_build_object('ok', false, 'error', 'already_submitted', 'submission', v_existing, 'answers_revealed', v_reveal,
      'questions', case when v_reveal then v_quiz_json -> 'questions' else itqan.strip_answers(v_quiz_json -> 'questions') end);
  end if;

  select a2.started_at into v_started from itqan.quiz_attempts a2
  where a2.student_id = v_student.id::text and a2.quiz_id = p_quiz_id;

  v_questions := case when jsonb_typeof(v_quiz_json -> 'questions') = 'array' then v_quiz_json -> 'questions' else '[]'::jsonb end;
  for q in select * from jsonb_array_elements(v_questions) loop
    select x into a from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) x
    where x ->> 'question_id' = q ->> 'id' limit 1;

    if q ->> 'type' = 'passage' then
      v_subs := '[]'::jsonb; v_awarded := 0; v_possible := 0;
      for sq in select * from jsonb_array_elements(coalesce(q -> 'sub_questions', '[]'::jsonb)) loop
        sa := null;
        if a is not null and jsonb_typeof(a -> 'sub_answers') = 'array' then
          select y into sa from jsonb_array_elements(a -> 'sub_answers') y
          where y ->> 'sub_question_id' = sq ->> 'id' limit 1;
        end if;
        v_m := coalesce(nullif(sq ->> 'marks', '')::numeric, 0);
        v_sel := case when jsonb_typeof(sa -> 'selected_option') = 'number' then (sa ->> 'selected_option')::int end;
        v_ok := coalesce(sq ->> 'type', '') <> 'essay' and v_sel is not null
                and v_sel = nullif(sq ->> 'correct_option_index', '')::int;
        v_possible := v_possible + v_m;
        v_awarded := v_awarded + case when v_ok then v_m else 0 end;
        v_subs := v_subs || jsonb_strip_nulls(jsonb_build_object(
          'sub_question_id', sq ->> 'id', 'selected_option', v_sel,
          'text_answer', left(nullif(sa ->> 'text_answer', ''), 5000),
          'is_correct', v_ok, 'marks_awarded', case when v_ok then v_m else 0 end));
      end loop;
      v_total := v_total + v_possible;
      v_score := v_score + v_awarded;
      v_graded := v_graded || jsonb_build_object(
        'question_id', q ->> 'id', 'selected_option', null,
        'is_correct', v_possible > 0 and v_awarded = v_possible,
        'marks_awarded', v_awarded, 'sub_answers', v_subs);
    else
      v_m := coalesce(nullif(q ->> 'marks', '')::numeric, 0);
      v_sel := case when jsonb_typeof(a -> 'selected_option') = 'number' then (a ->> 'selected_option')::int end;
      v_ok := coalesce(q ->> 'type', '') <> 'essay' and v_sel is not null
              and v_sel = nullif(q ->> 'correct_option_index', '')::int;
      v_total := v_total + v_m;
      v_score := v_score + case when v_ok then v_m else 0 end;
      v_graded := v_graded || jsonb_strip_nulls(jsonb_build_object(
        'question_id', q ->> 'id', 'selected_option', v_sel,
        'text_answer', left(nullif(a ->> 'text_answer', ''), 5000),
        'is_correct', v_ok, 'marks_awarded', case when v_ok then v_m else 0 end))
        || jsonb_build_object('selected_option', v_sel);
    end if;
  end loop;

  v_row := jsonb_build_object(
    'id', coalesce(nullif(p_client_id, ''), 'sub-' || (extract(epoch from now()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4)),
    'quiz_id', p_quiz_id,
    'student_id', v_student.id::text,
    'score', v_score,
    'total_possible_score', v_total,
    'percentage', case when v_total > 0 then round(v_score / v_total * 100) else 0 end,
    'answers_json', v_graded,
    'completed_at', now(),
    'status', 'completed',
    -- الوقت المستغرق يُحسب من وقت البدء المسجّل على الخادم (إن وُجد)
    'time_spent_seconds', greatest(0, least(
      coalesce(extract(epoch from now() - v_started)::int, p_time_spent, 0), (v_duration * 60 + 300)::int)),
    'is_retake', v_existing is not null
  );
  v_inserted := itqan.insert_json('submissions', v_row);

  if v_retake then
    -- إلغاء إذن الإعادة بعد استخدامه (يعمل سواء كان العمود text[] أو jsonb)
    perform set_config('itqan.internal', '1', true);
    execute format(
      'update public.quizzes set allowed_retake_student_ids = %s, updated_at = now() where id::text = $1',
      case when (select c.data_type from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'quizzes'
                   and c.column_name = 'allowed_retake_student_ids') in ('jsonb', 'json')
        then '(select coalesce(jsonb_agg(x), ''[]''::jsonb) from jsonb_array_elements_text(to_jsonb(allowed_retake_student_ids)) x where x <> $2)'
        else '(select coalesce(array_agg(x), ''{}'') from unnest(allowed_retake_student_ids) x where x::text <> $2)'
      end)
    using p_quiz_id, v_student.id::text;
    perform set_config('itqan.internal', '', true);
  end if;

  delete from itqan.quiz_attempts where student_id = v_student.id::text and quiz_id = p_quiz_id;

  return jsonb_build_object('ok', true, 'submission', v_inserted, 'answers_revealed', v_reveal,
    'questions', case when v_reveal then v_questions else itqan.strip_answers(v_questions) end);
end $$;

-- ---------------------------------------------------------------------
-- صلاحيات تعديل الاختبارات (مشغّل يفحص كل تعديل)
-- ---------------------------------------------------------------------
create or replace function itqan.quizzes_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := itqan.uid();
  v_owner boolean;
  o jsonb; n jsonb;
begin
  -- لوحة Supabase (بدون جلسة)، أو دوال الخادم نفسها (مثل إلغاء إذن الإعادة بعد التسليم)، أو المدير: بلا قيود
  if v_uid is null or current_setting('itqan.internal', true) = '1' or itqan.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- الاختبار الجديد باسم منشئه
    if coalesce(to_jsonb(new) ->> 'teacher_id', '') <> v_uid and coalesce(to_jsonb(new) ->> 'created_by', '') <> v_uid then
      raise exception 'لا يمكن إنشاء اختبار باسم معلم آخر' using errcode = '42501';
    end if;
    return new;
  end if;

  v_owner := coalesce(to_jsonb(old) ->> 'teacher_id', '') = v_uid or coalesce(to_jsonb(old) ->> 'created_by', '') = v_uid;

  if tg_op = 'DELETE' then
    if not v_owner then
      raise exception 'حذف الاختبار متاح لصاحبه أو للمدير فقط' using errcode = '42501';
    end if;
    return old;
  end if;

  -- نقل ملكية الاختبار للمدير فقط
  if (to_jsonb(new) ->> 'teacher_id') is distinct from (to_jsonb(old) ->> 'teacher_id') then
    raise exception 'نقل الاختبار لمعلم آخر متاح للمدير فقط' using errcode = '42501';
  end if;
  if v_owner or itqan.has_perm('can_approve_quizzes') then
    return new;
  end if;

  -- غير المالك: تغيير قائمة إعادة المحاولة فقط (لمن يملك الصلاحية)
  o := to_jsonb(old) - 'allowed_retake_student_ids' - 'updated_at';
  n := to_jsonb(new) - 'allowed_retake_student_ids' - 'updated_at';
  if o = n and itqan.has_perm('can_manage_retakes') then
    return new;
  end if;
  raise exception 'تعديل الاختبار متاح لصاحبه أو للمدير فقط' using errcode = '42501';
end $$;

drop trigger if exists itqan_quizzes_guard on public.quizzes;
create trigger itqan_quizzes_guard
  before insert or update or delete on public.quizzes
  for each row execute function itqan.quizzes_guard_trigger();

grant execute on function itqan.window_start(text), itqan.window_end(text), itqan.reveal_answers(jsonb) to anon, authenticated;
revoke execute on function public.itqan_start_quiz(text) from public;
grant execute on function public.itqan_start_quiz(text), public.itqan_student_quizzes(),
  public.itqan_submit_quiz(text, jsonb, integer, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 004' as result;
