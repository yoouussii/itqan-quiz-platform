-- =====================================================================
-- منصة إتقان: الحماية الأساسية (مجانية بالكامل، لا تحتاج باقة Pro)
--
-- ماذا يفعل هذا الملف:
--   1. يشفّر كلمات المرور (bcrypt) ويحذف النص الصريح من جدول users.
--      كل مستخدم يبقى بكلمة مروره الحالية.
--   2. تسجيل الدخول عبر الخادم: جلسة لكل مستخدم مدتها 12 ساعة،
--      مع قفل مؤقت بعد 8 محاولات خاطئة.
--   3. سياسات الحماية (RLS) على كل الجداول: الطالب لا يرى إلا بياناته،
--      ولا يعدّل الصلاحيات أو الاختبارات أو الدرجات.
--   4. تصحيح الاختبار على الخادم، وإخفاء الإجابات النموذجية عن الطالب
--      قبل أن يسلّم.
--
-- الترتيب الصحيح: انشر نسخة الموقع الجديدة أولاً، ثم شغّل هذا الملف من
-- SQL Editor. (النسخة الجديدة تعمل قبله وبعده.)
-- الملف آمن لإعادة التشغيل. للتراجع عن سياسات الحماية: 003_rollback.sql
-- =====================================================================

create schema if not exists itqan;
revoke all on schema itqan from public;
grant usage on schema itqan to anon, authenticated;

-- ---------------------------------------------------------------------
-- جداول خاصة (غير مكشوفة للتطبيق إطلاقاً)
-- ---------------------------------------------------------------------
create table if not exists itqan.credentials (
  user_id        text primary key,
  password_hash  text not null,
  updated_at     timestamptz not null default now()
);

create table if not exists itqan.sessions (
  token_hash  text primary key,
  user_id     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists sessions_user_idx on itqan.sessions (user_id);

create table if not exists itqan.login_attempts (
  login_key     text primary key,
  failures      integer not null default 0,
  locked_until  timestamptz
);

revoke all on all tables in schema itqan from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- دوال مساعدة: من المستخدم صاحب الطلب الحالي؟
-- (الموقع يرسل رمز الجلسة في الترويسة x-itqan-session)
-- ---------------------------------------------------------------------
create or replace function itqan.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function itqan.request_token()
returns text language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-itqan-session', '');
$$;

create or replace function itqan.uid()
returns text language sql stable security definer set search_path = '' as $$
  select s.user_id
  from itqan.sessions s
  where s.token_hash = itqan.hash_token(itqan.request_token())
    and s.expires_at > now()
  limit 1;
$$;

create or replace function itqan.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select u.role from public.users u where u.id::text = itqan.uid() limit 1;
$$;

create or replace function itqan.is_staff()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(itqan.my_role() in ('admin', 'teacher', 'supervisor'), false);
$$;

create or replace function itqan.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(itqan.my_role() = 'admin', false);
$$;

-- نفس منطق hasPerm في الموقع (src/utils/permissions.ts)
create or replace function itqan.has_perm(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when u.role = 'admin' then true
      when u.role = 'student' then false
      when coalesce((u.teacher_permissions ->> p_key)::boolean, false)
        or coalesce((u.permissions ->> p_key)::boolean, false) then true
      when u.role = 'teacher' and p_key in ('can_export_reports', 'can_manage_retakes') then true
      when u.role = 'supervisor' and p_key = 'can_access_preparations' then true
      else false
    end
    from public.users u where u.id::text = itqan.uid() limit 1
  ), false);
$$;

-- هل الاختبار موجّه لهذا الطالب؟ (نفس منطق getQuizzesForStudent)
create or replace function itqan.quiz_targets_student(q public.quizzes, p_student public.users)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  asg jsonb := coalesce(to_jsonb(q) -> 'assignments', '[]'::jsonb);
  a jsonb;
  my_classes text[];
begin
  my_classes := array_remove(
    array[p_student.class_id::text] ||
    coalesce(array(select jsonb_array_elements_text(coalesce(to_jsonb(p_student) -> 'assigned_class_ids', '[]'::jsonb))), '{}'),
    null);

  if jsonb_typeof(asg) <> 'array' or jsonb_array_length(asg) = 0 then
    -- صفوف قديمة بلا assignments
    asg := jsonb_build_array(jsonb_build_object(
      'target_type', coalesce(to_jsonb(q) ->> 'target_type', 'all'),
      'target_id', case
        when to_jsonb(q) ->> 'target_type' = 'class' then to_jsonb(q) ->> 'class_id'
        when to_jsonb(q) ->> 'target_type' = 'specific_students' then
          (select string_agg(x, ',') from jsonb_array_elements_text(coalesce(to_jsonb(q) -> 'student_ids', '[]'::jsonb)) x)
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

-- إزالة الإجابات النموذجية والشرح من أسئلة الاختبار
create or replace function itqan.strip_answers(p_questions jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(
    (q - 'correct_option_index' - 'correctAnswer' - 'blankAnswer' - 'explanation' - 'pairs')
    || case when jsonb_typeof(q -> 'sub_questions') = 'array' then
         jsonb_build_object('sub_questions', (
           select coalesce(jsonb_agg(sq - 'correct_option_index' - 'correctAnswer' - 'explanation'), '[]'::jsonb)
           from jsonb_array_elements(q -> 'sub_questions') sq))
       else '{}'::jsonb end
  ), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end) q;
$$;

-- إدراج صف من jsonb في أي جدول مع تجاهل المفاتيح غير الموجودة كأعمدة
create or replace function itqan.insert_json(p_table text, p_row jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cols text; result jsonb;
begin
  select string_agg(quote_ident(c.column_name), ', ')
    into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_table and p_row ? c.column_name;
  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(%I.*)',
    p_table, cols, cols, p_table, p_table)
  into result using p_row;
  return result;
end $$;

grant execute on all functions in schema itqan to anon, authenticated;
revoke execute on function itqan.insert_json(text, jsonb) from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- تشفير كلمات المرور: أي كلمة مرور تُكتب في users.password تتحول فوراً
-- إلى hash في itqan.credentials ويُمسح النص الصريح
-- ---------------------------------------------------------------------
create or replace function itqan.users_password_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.password is not null and new.password <> '' then
    insert into itqan.credentials (user_id, password_hash, updated_at)
    values (new.id::text, extensions.crypt(new.password, extensions.gen_salt('bf', 10)), now())
    on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now();
    -- تغيير كلمة المرور يُنهي جلسات المستخدم الأخرى
    if tg_op = 'UPDATE' then
      delete from itqan.sessions
      where user_id = new.id::text
        and token_hash is distinct from itqan.hash_token(itqan.request_token());
    end if;
  end if;
  new.password := null;
  return new;
end $$;

drop trigger if exists itqan_users_password on public.users;
create trigger itqan_users_password
  before insert or update of password on public.users
  for each row execute function itqan.users_password_trigger();

-- حماية الأدوار والصلاحيات: غير المدير لا يستطيع تغييرها (ولا لنفسه)
create or replace function itqan.users_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- التعديل من لوحة Supabase (بدون جلسة) أو من المدير: بلا قيود
  if itqan.uid() is null or itqan.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.teacher_permissions := '{}'::jsonb;
    new.permissions := '{}'::jsonb;
    return new;
  end if;
  new.role := old.role;
  new.teacher_permissions := old.teacher_permissions;
  new.permissions := old.permissions;
  return new;
end $$;

drop trigger if exists itqan_users_guard on public.users;
create trigger itqan_users_guard
  before insert or update on public.users
  for each row execute function itqan.users_guard_trigger();

-- حذف المستخدم يحذف كلمة مروره وجلساته
create or replace function itqan.users_delete_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from itqan.credentials where user_id = old.id::text;
  delete from itqan.sessions where user_id = old.id::text;
  return old;
end $$;

drop trigger if exists itqan_users_delete on public.users;
create trigger itqan_users_delete
  after delete on public.users
  for each row execute function itqan.users_delete_trigger();

-- ترحيل كلمات المرور الحالية (يُطلق المشغّل أعلاه لكل صف)
update public.users set password = password where password is not null and password <> '';

-- ---------------------------------------------------------------------
-- دوال يستدعيها الموقع (RPC)
-- ---------------------------------------------------------------------
create or replace function public.itqan_login(p_national_id text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key text := lower(trim(coalesce(p_national_id, '')));
  v_user public.users;
  v_hash text;
  v_attempt itqan.login_attempts;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if v_key = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_attempt from itqan.login_attempts where login_key = v_key;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'retry_after_seconds', ceil(extract(epoch from v_attempt.locked_until - now())));
  end if;

  select * into v_user from public.users u
  where lower(trim(u.national_id)) = v_key or lower(trim(coalesce(u.username, ''))) = v_key
  order by (lower(trim(u.national_id)) = v_key) desc
  limit 1;

  if found then
    select c.password_hash into v_hash from itqan.credentials c where c.user_id = v_user.id::text;
    -- مستخدم أُضيف بكلمة مرور صريحة قبل تفعيل المشغّل
    if v_hash is null and v_user.password is not null and v_user.password = p_password then
      update public.users set password = password where id = v_user.id;
      select c.password_hash into v_hash from itqan.credentials c where c.user_id = v_user.id::text;
    end if;
  end if;

  if v_hash is null or extensions.crypt(p_password, v_hash) <> v_hash then
    insert into itqan.login_attempts (login_key, failures, locked_until)
    values (v_key, 1, null)
    on conflict (login_key) do update set
      failures = itqan.login_attempts.failures + 1,
      locked_until = case when itqan.login_attempts.failures + 1 >= 8
                          then now() + interval '10 minutes' end;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  delete from itqan.login_attempts where login_key = v_key;
  delete from itqan.sessions where expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into itqan.sessions (token_hash, user_id, expires_at)
  values (itqan.hash_token(v_token), v_user.id::text, v_expires);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'user', to_jsonb(v_user) - 'password',
    'password_is_default', extensions.crypt('itqan123', v_hash) = v_hash
  );
end $$;

create or replace function public.itqan_logout()
returns void language sql security definer set search_path = '' as $$
  delete from itqan.sessions where token_hash = itqan.hash_token(itqan.request_token());
$$;

-- يعيد المستخدم صاحب الجلسة الحالية (أو null إذا انتهت أو أُلغيت)
create or replace function public.itqan_session_user()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(u) - 'password' from public.users u where u.id::text = itqan.uid();
$$;

create or replace function public.itqan_change_password(p_current text, p_new text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid(); v_hash text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  if length(coalesce(p_new, '')) < 6 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  select password_hash into v_hash from itqan.credentials where user_id = v_uid;
  if v_hash is null or extensions.crypt(coalesce(p_current, ''), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_password');
  end if;
  update public.users set password = p_new, updated_at = now() where id::text = v_uid;
  return jsonb_build_object('ok', true);
end $$;

-- اختبارات الطالب: الموجّهة له فقط، وبدون الإجابات النموذجية قبل التسليم
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
    if not v_done or v_retake then
      v_row := jsonb_set(v_row, '{questions}', itqan.strip_answers(v_row -> 'questions'));
    end if;
    -- اسم المعلم فقط (الطالب لا يرى بيانات المستخدمين الآخرين)
    v_row := v_row || jsonb_build_object('teacher', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'role', t.role, 'job_title', to_jsonb(t) -> 'job_title')
      from public.users t where t.id::text = v_row ->> 'teacher_id'));
    return next v_row;
  end loop;
end $$;

-- تسليم الاختبار: يُصحَّح على الخادم ولا يُقبل من الطالب أي درجة جاهزة
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

  v_start := nullif(v_quiz_json ->> 'start_date', '')::timestamptz;
  v_end := nullif(v_quiz_json ->> 'end_date', '')::timestamptz;
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
      return jsonb_build_object('ok', true, 'submission', v_existing, 'questions', v_quiz_json -> 'questions');
    end if;
  end if;

  v_retake := v_student.id::text in (
    select jsonb_array_elements_text(coalesce(v_quiz_json -> 'allowed_retake_student_ids', '[]'::jsonb)));
  select to_jsonb(s) into v_existing from public.submissions s
  where s.quiz_id::text = p_quiz_id and s.student_id::text = v_student.id::text
  order by s.completed_at desc limit 1;
  if v_existing is not null and not v_retake then
    return jsonb_build_object('ok', false, 'error', 'already_submitted', 'submission', v_existing,
                              'questions', v_quiz_json -> 'questions');
  end if;

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
    'time_spent_seconds', greatest(0, least(coalesce(p_time_spent, 0), (v_duration * 60 + 300)::int)),
    'is_retake', v_existing is not null
  );
  v_inserted := itqan.insert_json('submissions', v_row);

  if v_retake then
    -- إلغاء إذن الإعادة بعد استخدامه (يعمل سواء كان العمود text[] أو jsonb)
    execute format(
      'update public.quizzes set allowed_retake_student_ids = %s, updated_at = now() where id::text = $1',
      case when (select c.data_type from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'quizzes'
                   and c.column_name = 'allowed_retake_student_ids') in ('jsonb', 'json')
        then '(select coalesce(jsonb_agg(x), ''[]''::jsonb) from jsonb_array_elements_text(to_jsonb(allowed_retake_student_ids)) x where x <> $2)'
        else '(select coalesce(array_agg(x), ''{}'') from unnest(allowed_retake_student_ids) x where x::text <> $2)'
      end)
    using p_quiz_id, v_student.id::text;
  end if;

  return jsonb_build_object('ok', true, 'submission', v_inserted, 'questions', v_questions);
end $$;

revoke execute on function public.itqan_login(text, text), public.itqan_logout(), public.itqan_session_user(),
  public.itqan_change_password(text, text), public.itqan_student_quizzes(),
  public.itqan_submit_quiz(text, jsonb, integer, text) from public;
grant execute on function public.itqan_login(text, text), public.itqan_logout(), public.itqan_session_user(),
  public.itqan_change_password(text, text), public.itqan_student_quizzes(),
  public.itqan_submit_quiz(text, jsonb, integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- سياسات الحماية (RLS)
-- ---------------------------------------------------------------------
do $$
declare t text; p record;
begin
  foreach t in array array['users','subjects','classes','quizzes','submissions','notifications',
                           'notification_reads','activity_log','student_awards','app_settings','user_avatars']
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'الجدول % غير موجود، تم تخطيه', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    -- حذف أي سياسات قديمة (بما فيها السماح للجميع) لتحل محلها السياسات أدناه
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- users: الطاقم يرى الجميع، والطالب يرى نفسه فقط
create policy users_select on public.users for select to anon, authenticated
  using ((select itqan.is_staff()) or id::text = (select itqan.uid()));
create policy users_insert on public.users for insert to anon, authenticated
  with check ((select itqan.is_admin())
    or (role = 'student' and (select itqan.has_perm('can_add_students')))
    or (role = 'teacher' and (select itqan.has_perm('can_add_teachers'))));
create policy users_update on public.users for update to anon, authenticated
  using ((select itqan.is_admin())
    or (id::text = (select itqan.uid()) and (select itqan.is_staff()))
    or (role = 'student' and (select itqan.has_perm('can_add_students')))
    or (role = 'teacher' and (select itqan.has_perm('can_add_teachers'))));
create policy users_delete on public.users for delete to anon, authenticated
  using ((select itqan.is_admin())
    or (role = 'student' and (select itqan.has_perm('can_add_students'))));

-- subjects / classes
create policy subjects_select on public.subjects for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy subjects_write on public.subjects for all to anon, authenticated
  using ((select itqan.has_perm('can_add_custom_subjects')))
  with check ((select itqan.has_perm('can_add_custom_subjects')));
create policy classes_select on public.classes for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy classes_write on public.classes for all to anon, authenticated
  using ((select itqan.has_perm('can_manage_classes')))
  with check ((select itqan.has_perm('can_manage_classes')));

-- quizzes: الطاقم فقط مباشرة (الطالب عبر itqan_student_quizzes)
create policy quizzes_staff on public.quizzes for all to anon, authenticated
  using ((select itqan.is_staff())) with check ((select itqan.is_staff()));

-- submissions: الطالب يقرأ نتائجه فقط (والتسليم عبر itqan_submit_quiz)
create policy submissions_select on public.submissions for select to anon, authenticated
  using ((select itqan.is_staff()) or student_id::text = (select itqan.uid()));
create policy submissions_staff_write on public.submissions for all to anon, authenticated
  using ((select itqan.is_staff())) with check ((select itqan.is_staff()));

-- notifications
create policy notifications_select on public.notifications for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy notifications_insert on public.notifications for insert to anon, authenticated
  with check ((select itqan.is_staff()) and created_by = (select itqan.uid()));
create policy notifications_admin on public.notifications for delete to anon, authenticated
  using ((select itqan.is_admin()));

create policy notification_reads_own on public.notification_reads for all to anon, authenticated
  using (user_id = (select itqan.uid())) with check (user_id = (select itqan.uid()));

-- activity_log
create policy activity_insert on public.activity_log for insert to anon, authenticated
  with check (actor_id = (select itqan.uid()));
create policy activity_select on public.activity_log for select to anon, authenticated
  using ((select itqan.has_perm('can_view_activity_log')));

-- student_awards (لوحة الشرف ظاهرة للجميع)
create policy awards_select on public.student_awards for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy awards_insert on public.student_awards for insert to anon, authenticated
  with check ((select itqan.has_perm('can_award_badges')));
create policy awards_admin on public.student_awards for delete to anon, authenticated
  using ((select itqan.is_admin()));

-- app_settings
create policy settings_select on public.app_settings for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy settings_admin on public.app_settings for all to anon, authenticated
  using ((select itqan.is_admin())) with check ((select itqan.is_admin()));

-- user_avatars
create policy avatars_select on public.user_avatars for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy avatars_own on public.user_avatars for all to anon, authenticated
  using (user_id = (select itqan.uid()) or (select itqan.is_admin()))
  with check (user_id = (select itqan.uid()) or (select itqan.is_admin()));

notify pgrst, 'reload schema';
