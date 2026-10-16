-- =====================================================================
-- 091: عدد تسليمات كل اختبار من الخادم مباشرة
--  بنك الاختبارات كان يعدّ التسليمات من النسخة المحفوظة في المتصفح، وقد تكون ناقصة
--  (ذاكرة المتصفح ممتلئة أو تحميل جزئي)، فيظهر عدد أقل من الحقيقي. هذه الدالة تعيد
--  العدد الكامل لكل اختبار للطاقم. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_quiz_submission_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not coalesce(itqan.is_staff(), false) then '{}'::jsonb else coalesce((
    select jsonb_object_agg(quiz_id, n) from (
      select s.quiz_id::text as quiz_id, count(*)::int as n from public.submissions s where s.quiz_id is not null group by s.quiz_id::text) x), '{}'::jsonb) end;
$$;

revoke all on function public.itqan_quiz_submission_counts() from public;
grant execute on function public.itqan_quiz_submission_counts() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 091: عدد تسليمات كل اختبار من الخادم' as result;
