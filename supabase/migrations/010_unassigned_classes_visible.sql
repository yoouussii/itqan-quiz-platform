-- =====================================================================
-- منصة إتقان: 010 — الشعب غير المربوطة بفرع تظهر للجميع
--
-- يتطلب 009 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- السبب: بعد 009 كان المعلم المسند لفرع لا يرى إلا شعب فرعه، فإذا لم تُربط الشعب
-- بأي فرع ظهرت له صفحة إنشاء الاختبار بلا شعب («لا توجد صفوف متاحة لك»).
-- الآن: الشعبة بلا فرع مشتركة ويراها الجميع، وشعبة الفرع لا يراها إلا فرعها.
-- (الطلاب والنتائج والاختبارات ما زالت محصورة في الفرع كما في 009.)
-- =====================================================================

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to anon, authenticated
  using ((select itqan.uid()) is not null
    and ((select itqan.my_branch()) is null
         or nullif(branch_id, '') is null
         or branch_id = (select itqan.my_branch())));

notify pgrst, 'reload schema';

select '✓ تم تحديث 010: الشعب غير المربوطة بفرع ظاهرة للجميع' as result;
