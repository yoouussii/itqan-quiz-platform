-- =====================================================================
-- منصة إتقان — الحماية: الجزء 5 من 5 (سياسات الحماية (RLS) — آخر خطوة)
-- شغّل الأجزاء بالترتيب 1 ← 5. كل جزء آمن لإعادة التشغيل.
-- يجب أن تظهر في النهاية رسالة «✓ تم الجزء 5»؛ إن ظهر خطأ فالنص لم يُنسخ كاملاً.
-- =====================================================================

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

-- إنشاء السياسة فقط إذا كان الجدول موجوداً
create or replace function itqan.add_policy(p_table text, p_ddl text)
returns void language plpgsql set search_path = '' as $$
begin
  if to_regclass('public.' || p_table) is not null then
    execute p_ddl;
  end if;
end $$;

-- users: الطاقم يرى الجميع، والطالب يرى نفسه فقط
select itqan.add_policy('users', $p$
create policy users_select on public.users for select to anon, authenticated
  using ((select itqan.is_staff()) or id::text = (select itqan.uid()))
$p$);
select itqan.add_policy('users', $p$
create policy users_insert on public.users for insert to anon, authenticated
  with check ((select itqan.is_admin())
    or (role = 'student' and (select itqan.has_perm('can_add_students')))
    or (role = 'teacher' and (select itqan.has_perm('can_add_teachers'))))
$p$);
select itqan.add_policy('users', $p$
create policy users_update on public.users for update to anon, authenticated
  using ((select itqan.is_admin())
    or (id::text = (select itqan.uid()) and (select itqan.is_staff()))
    or (role = 'student' and (select itqan.has_perm('can_add_students')))
    or (role = 'teacher' and (select itqan.has_perm('can_add_teachers'))))
$p$);
select itqan.add_policy('users', $p$
create policy users_delete on public.users for delete to anon, authenticated
  using ((select itqan.is_admin())
    or (role = 'student' and (select itqan.has_perm('can_add_students'))))
$p$);

-- subjects / classes
select itqan.add_policy('subjects', $p$
create policy subjects_select on public.subjects for select to anon, authenticated
  using ((select itqan.uid()) is not null)
$p$);
select itqan.add_policy('subjects', $p$
create policy subjects_write on public.subjects for all to anon, authenticated
  using ((select itqan.has_perm('can_add_custom_subjects')))
  with check ((select itqan.has_perm('can_add_custom_subjects')))
$p$);
select itqan.add_policy('classes', $p$
create policy classes_select on public.classes for select to anon, authenticated
  using ((select itqan.uid()) is not null)
$p$);
select itqan.add_policy('classes', $p$
create policy classes_write on public.classes for all to anon, authenticated
  using ((select itqan.has_perm('can_manage_classes')))
  with check ((select itqan.has_perm('can_manage_classes')))
$p$);

-- quizzes: الطاقم فقط مباشرة (الطالب عبر itqan_student_quizzes)
select itqan.add_policy('quizzes', $p$
create policy quizzes_staff on public.quizzes for all to anon, authenticated
  using ((select itqan.is_staff())) with check ((select itqan.is_staff()))
$p$);

-- submissions: الطالب يقرأ نتائجه فقط (والتسليم عبر itqan_submit_quiz)
select itqan.add_policy('submissions', $p$
create policy submissions_select on public.submissions for select to anon, authenticated
  using ((select itqan.is_staff()) or student_id::text = (select itqan.uid()))
$p$);
select itqan.add_policy('submissions', $p$
create policy submissions_staff_write on public.submissions for all to anon, authenticated
  using ((select itqan.is_staff())) with check ((select itqan.is_staff()))
$p$);

-- notifications
select itqan.add_policy('notifications', $p$
create policy notifications_select on public.notifications for select to anon, authenticated
  using ((select itqan.uid()) is not null)
$p$);
select itqan.add_policy('notifications', $p$
create policy notifications_insert on public.notifications for insert to anon, authenticated
  with check ((select itqan.is_staff()) and created_by = (select itqan.uid()))
$p$);
select itqan.add_policy('notifications', $p$
create policy notifications_admin on public.notifications for delete to anon, authenticated
  using ((select itqan.is_admin()))
$p$);

select itqan.add_policy('notification_reads', $p$
create policy notification_reads_own on public.notification_reads for all to anon, authenticated
  using (user_id = (select itqan.uid())) with check (user_id = (select itqan.uid()))
$p$);

-- activity_log
select itqan.add_policy('activity_log', $p$
create policy activity_insert on public.activity_log for insert to anon, authenticated
  with check (actor_id = (select itqan.uid()))
$p$);
select itqan.add_policy('activity_log', $p$
create policy activity_select on public.activity_log for select to anon, authenticated
  using ((select itqan.has_perm('can_view_activity_log')))
$p$);

-- student_awards (لوحة الشرف ظاهرة للجميع)
select itqan.add_policy('student_awards', $p$
create policy awards_select on public.student_awards for select to anon, authenticated
  using ((select itqan.uid()) is not null)
$p$);
select itqan.add_policy('student_awards', $p$
create policy awards_insert on public.student_awards for insert to anon, authenticated
  with check ((select itqan.has_perm('can_award_badges')))
$p$);
select itqan.add_policy('student_awards', $p$
create policy awards_admin on public.student_awards for delete to anon, authenticated
  using ((select itqan.is_admin()))
$p$);

-- app_settings
select itqan.add_policy('app_settings', $p$
create policy settings_select on public.app_settings for select to anon, authenticated
  using ((select itqan.uid()) is not null)
$p$);
select itqan.add_policy('app_settings', $p$
create policy settings_admin on public.app_settings for all to anon, authenticated
  using ((select itqan.is_admin())) with check ((select itqan.is_admin()))
$p$);

-- user_avatars
select itqan.add_policy('user_avatars', $p$
create policy avatars_select on public.user_avatars for select to anon, authenticated
  using ((select itqan.uid()) is not null)
$p$);
select itqan.add_policy('user_avatars', $p$
create policy avatars_own on public.user_avatars for all to anon, authenticated
  using (user_id = (select itqan.uid()) or (select itqan.is_admin()))
  with check (user_id = (select itqan.uid()) or (select itqan.is_admin()))
$p$);

notify pgrst, 'reload schema';

select '✓ تم الجزء 5 من 5' as result;
