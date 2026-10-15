-- =====================================================================
-- منصة إتقان: 075 — الموظف الذي له أبناء في المدرسة (وكيل أو معلم وهو ولي أمر)
--  أبناء المستخدم يحددهم المدير فقط (حارس المستخدمين في 009)، فلم يعد لازماً أن يكون
--  دوره «ولي أمر» حتى تصله بيانات أبنائه: يتبدّل من القائمة بين حسابه الوظيفي وواجهة ولي الأمر.
--
-- يتطلب 009. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.my_children()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce((
    select array(select jsonb_array_elements_text(coalesce(u.child_ids, '[]'::jsonb)))
    from public.users u where u.id::text = itqan.uid() and u.role::text <> 'student' limit 1
  ), '{}'::text[]);
$$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 075: الموظف ولي الأمر' as result;
