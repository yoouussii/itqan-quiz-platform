-- =====================================================================
-- منصة إتقان: 009 — الفروع، والنوع (ذكر/أنثى)، وحسابات أولياء الأمور
--
-- يتطلب 003 و 004 و 007 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
--
-- الفروع:
--  - جدول branches يديره مدير النظام، والمستخدمون والشعب لهم عمود branch_id.
--  - المعلم أو المشرف المسند لفرع يرى طلاب فرعه وشعبه واختباراته ونتائجه فقط.
--    من بلا فرع (والمدير) يرى الكل كما كان.
--  - لا يغيّر فرعَ مستخدمٍ إلا المدير. من يضيف طلاباً وهو مسند لفرع: الطالب الجديد في فرعه.
--  - اختبار معلم الفرع لا يصل إلا لطلاب نفس الفرع (حتى لو وُجّه «للجميع»).
-- أولياء الأمور:
--  - دور parent، وعمود child_ids يحوي معرّفات أبنائه (يحدده المدير فقط).
--  - ولي الأمر يرى حسابه وحسابات أبنائه ونتائجهم، واختباراتهم عبر itqan_child_quizzes
--    (بدون الإجابات النموذجية قبل وقتها). لا يحل اختباراً ولا يرى بيانات غيرهم.
-- النوع: عمود gender (male / female) للصياغة والتصفية.
-- =====================================================================

-- ---------- الأعمدة والجداول ----------
create table if not exists public.branches (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.branches enable row level security;
grant select, insert, update, delete on public.branches to anon, authenticated;

alter table public.users add column if not exists branch_id text;
alter table public.users add column if not exists gender text;
alter table public.users add column if not exists child_ids jsonb not null default '[]'::jsonb;
alter table public.classes add column if not exists branch_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_gender_check') then
    alter table public.users add constraint users_gender_check check (gender is null or gender in ('male', 'female'));
  end if;
end $$;

-- دور ولي الأمر: قيد الأدوار (أو نوع enum) يشمل parent
do $$
declare c record; t regtype;
begin
  select atttypid::regtype into t from pg_attribute where attrelid = 'public.users'::regclass and attname = 'role';
  if exists (select 1 from pg_type where oid = t::oid and typtype = 'e') then
    execute format('alter type %s add value if not exists %L', t, 'parent');
  else
    for c in
      select con.conname from pg_constraint con
      where con.conrelid = 'public.users'::regclass and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%role%'
    loop
      execute format('alter table public.users drop constraint %I', c.conname);
    end loop;
    alter table public.users
      add constraint users_role_check check (role in ('admin', 'teacher', 'student', 'supervisor', 'parent'));
  end if;
end $$;

-- ---------- دوال مساعدة ----------
-- فرع مستخدم معيّن
create or replace function itqan.user_branch(p_user text)
returns text language sql stable security definer set search_path = '' as $$
  select nullif(u.branch_id, '') from public.users u where u.id::text = p_user limit 1;
$$;

-- فرع المستخدم الحالي (المدير بلا فرع دائماً = يرى الكل)
create or replace function itqan.my_branch()
returns text language sql stable security definer set search_path = '' as $$
  select case when itqan.is_admin() then null else itqan.user_branch(itqan.uid()) end;
$$;

-- أبناء ولي الأمر الحالي
create or replace function itqan.my_children()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce((
    select array(select jsonb_array_elements_text(coalesce(u.child_ids, '[]'::jsonb)))
    from public.users u where u.id::text = itqan.uid() and u.role::text = 'parent' limit 1
  ), '{}'::text[]);
$$;

grant execute on function itqan.user_branch(text), itqan.my_branch(), itqan.my_children() to anon, authenticated;

-- ---------- السياسات ----------
-- branches
drop policy if exists branches_select on public.branches;
drop policy if exists branches_admin on public.branches;
create policy branches_select on public.branches for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy branches_admin on public.branches for all to anon, authenticated
  using ((select itqan.is_admin())) with check ((select itqan.is_admin()));

-- users: الطاقم يرى فرعه (ومن بلا فرع يرى الكل) ومديري النظام، وولي الأمر يرى أبناءه
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to anon, authenticated
  using (
    id::text = (select itqan.uid())
    or (select itqan.is_admin())
    or ((select itqan.is_staff()) and (
          (select itqan.my_branch()) is null
          or branch_id = (select itqan.my_branch())
          or role::text = 'admin'))
    or id::text = any(array(select unnest(itqan.my_children())))
  );

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to anon, authenticated
  with check ((select itqan.is_admin())
    or (((role::text = 'student' and (select itqan.has_perm('can_add_students')))
         or (role::text = 'teacher' and (select itqan.has_perm('can_add_teachers'))))
        and ((select itqan.my_branch()) is null or branch_id = (select itqan.my_branch()))));

drop policy if exists users_update on public.users;
create policy users_update on public.users for update to anon, authenticated
  using ((select itqan.is_admin())
    or (id::text = (select itqan.uid()) and (select itqan.is_staff()))
    or (((role::text = 'student' and (select itqan.has_perm('can_add_students')))
         or (role::text = 'teacher' and (select itqan.has_perm('can_add_teachers'))))
        and ((select itqan.my_branch()) is null or branch_id = (select itqan.my_branch()))));

drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete to anon, authenticated
  using ((select itqan.is_admin())
    or (role::text = 'student' and (select itqan.has_perm('can_add_students'))
        and ((select itqan.my_branch()) is null or branch_id = (select itqan.my_branch()))));

-- classes: شعب الفرع فقط لمن له فرع
drop policy if exists classes_select on public.classes;
drop policy if exists classes_write on public.classes;
create policy classes_select on public.classes for select to anon, authenticated
  using ((select itqan.uid()) is not null
    and ((select itqan.my_branch()) is null or branch_id = (select itqan.my_branch())));
create policy classes_write on public.classes for all to anon, authenticated
  using ((select itqan.has_perm('can_manage_classes'))
    and ((select itqan.my_branch()) is null or branch_id = (select itqan.my_branch())))
  with check ((select itqan.has_perm('can_manage_classes'))
    and ((select itqan.my_branch()) is null or branch_id = (select itqan.my_branch())));

-- quizzes: اختبارات معلمي الفرع (وصاحب الاختبار دائماً)
drop policy if exists quizzes_staff on public.quizzes;
create policy quizzes_staff on public.quizzes for all to anon, authenticated
  using ((select itqan.is_staff()) and (
    (select itqan.my_branch()) is null
    or teacher_id::text = (select itqan.uid())
    or itqan.user_branch(teacher_id::text) = (select itqan.my_branch())))
  with check ((select itqan.is_staff()) and (
    (select itqan.my_branch()) is null
    or teacher_id::text = (select itqan.uid())
    or itqan.user_branch(teacher_id::text) = (select itqan.my_branch())));

-- submissions: الطالب نتائجه، وولي الأمر نتائج أبنائه، والطاقم نتائج طلاب فرعه
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to anon, authenticated
  using (
    student_id::text = (select itqan.uid())
    or student_id::text = any(array(select unnest(itqan.my_children())))
    or ((select itqan.is_staff()) and (
          (select itqan.my_branch()) is null
          or itqan.user_branch(student_id::text) = (select itqan.my_branch())))
  );

drop policy if exists submissions_staff_insert on public.submissions;
drop policy if exists submissions_staff_update on public.submissions;
drop policy if exists submissions_delete on public.submissions;
create policy submissions_staff_insert on public.submissions for insert to anon, authenticated
  with check ((select itqan.is_staff()) and (
    (select itqan.my_branch()) is null or itqan.user_branch(student_id::text) = (select itqan.my_branch())));
create policy submissions_staff_update on public.submissions for update to anon, authenticated
  using ((select itqan.is_staff()) and (
    (select itqan.my_branch()) is null or itqan.user_branch(student_id::text) = (select itqan.my_branch())))
  with check ((select itqan.is_staff()) and (
    (select itqan.my_branch()) is null or itqan.user_branch(student_id::text) = (select itqan.my_branch())));
create policy submissions_delete on public.submissions for delete to anon, authenticated
  using ((select itqan.has_perm('can_delete_submissions')) and (
    (select itqan.my_branch()) is null or itqan.user_branch(student_id::text) = (select itqan.my_branch())));

-- ---------- حارس المستخدمين: الفرع والأبناء والدور للمدير فقط ----------
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
    new.child_ids := '[]'::jsonb;
    -- من يضيف وهو مسند لفرع: المستخدم الجديد في فرعه
    if itqan.my_branch() is not null then
      new.branch_id := itqan.my_branch();
    end if;
    return new;
  end if;
  new.role := old.role;
  new.teacher_permissions := old.teacher_permissions;
  new.permissions := old.permissions;
  new.branch_id := old.branch_id;
  new.child_ids := old.child_ids;
  return new;
end $$;

-- ---------- اختبارات الطالب (مشتركة بين الطالب وولي أمره) ----------
create or replace function itqan.quizzes_for_student(p_student public.users)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare q public.quizzes; v_row jsonb; v_done boolean; v_retake boolean; v_tb text;
begin
  for q in
    select * from public.quizzes
    where coalesce(to_jsonb(quizzes) ->> 'status', 'published') = 'published'
      and not coalesce((to_jsonb(quizzes) ->> 'is_deleted')::boolean, false)
  loop
    continue when not itqan.quiz_targets_student(q, p_student);
    -- اختبار معلم فرعٍ لا يصل لطلاب فرع آخر
    v_tb := itqan.user_branch(to_jsonb(q) ->> 'teacher_id');
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

create or replace function public.itqan_student_quizzes()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_student public.users;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role::text = 'student';
  if not found then return; end if;
  return query select * from itqan.quizzes_for_student(v_student);
end $$;

-- اختبارات ابن ولي الأمر (للمتابعة فقط)
create or replace function public.itqan_child_quizzes(p_child text)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_student public.users;
begin
  if not (p_child = any(itqan.my_children())) then return; end if;
  select * into v_student from public.users where id::text = p_child and role::text = 'student';
  if not found then return; end if;
  return query select * from itqan.quizzes_for_student(v_student);
end $$;

revoke execute on function itqan.quizzes_for_student(public.users) from public, anon, authenticated;
revoke execute on function public.itqan_child_quizzes(text) from public;
grant execute on function public.itqan_student_quizzes(), public.itqan_child_quizzes(text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 009: الفروع وأولياء الأمور والنوع' as result;
