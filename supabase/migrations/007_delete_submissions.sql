-- =====================================================================
-- منصة إتقان: 007 — حذف مشاركات (نتائج) الطلاب
--
-- يتطلب 003 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
--  - الحذف: مدير النظام، أو من يملك صلاحية «حذف مشاركات الطلاب».
--  - الإضافة والتعديل (مثل تصحيح المقالي): الطاقم كما كان.
--  - حذف مشاركة الطالب يتيح له دخول الاختبار مرة أخرى إن كان ما زال متاحاً.
-- =====================================================================

drop policy if exists submissions_staff_write on public.submissions;
drop policy if exists submissions_staff_insert on public.submissions;
drop policy if exists submissions_staff_update on public.submissions;
drop policy if exists submissions_delete on public.submissions;

create policy submissions_staff_insert on public.submissions for insert to anon, authenticated
  with check ((select itqan.is_staff()));
create policy submissions_staff_update on public.submissions for update to anon, authenticated
  using ((select itqan.is_staff())) with check ((select itqan.is_staff()));
create policy submissions_delete on public.submissions for delete to anon, authenticated
  using ((select itqan.has_perm('can_delete_submissions')));

-- عند حذف المشاركة تُغلق أي محاولة جارية لنفس الطالب والاختبار (004)
do $$
begin
  if to_regclass('itqan.quiz_attempts') is not null then
    execute $f$
      create or replace function itqan.submissions_delete_trigger()
      returns trigger language plpgsql security definer set search_path = '' as $b$
      begin
        delete from itqan.quiz_attempts where student_id = old.student_id::text and quiz_id = old.quiz_id::text;
        return old;
      end $b$;
    $f$;
    drop trigger if exists itqan_submissions_delete on public.submissions;
    create trigger itqan_submissions_delete
      after delete on public.submissions
      for each row execute function itqan.submissions_delete_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 007' as result;
