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
-- الترتيب الصحيح: انشر نسخة الموقع الجديدة أولاً، ثم شغّل الأجزاء 1 ← 5
-- من SQL Editor، كل جزء في استعلام مستقل. (النسخة الجديدة تعمل قبلها وبعدها.)
-- كل جزء آمن لإعادة التشغيل. للتراجع عن سياسات الحماية: 003_rollback.sql
--
-- هذا هو الجزء 1 من 5. يجب أن تظهر في النهاية رسالة «✓ تم الجزء 1».
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
-- مقفلة تماماً: لا يصل إليها إلا دوال الخادم (يمنع أيضاً تنبيه Supabase بإضافة RLS)
alter table itqan.credentials enable row level security;
alter table itqan.sessions enable row level security;
alter table itqan.login_attempts enable row level security;

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

select '✓ تم الجزء 1 من 5' as result;
