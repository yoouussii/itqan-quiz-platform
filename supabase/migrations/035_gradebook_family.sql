-- =====================================================================
-- منصة إتقان: 035 — كشف الدرجات للطالب وولي الأمر
--  - الطالب يقرأ درجاته في الأعمدة اليدوية، وولي الأمر يقرأ درجات أبنائه.
--  - الأعمدة اليدوية لفصل الطالب/الأبناء، وأوزان الاختبارات، مقروءة لهم (قراءة فقط).
--
-- يتطلب 009 و033 قبله. آمن لإعادة التشغيل.
-- =====================================================================

-- فصول المستخدم نفسه (طالب) أو أبنائه (ولي أمر)
create or replace function itqan.family_class_ids()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct u.class_id) filter (where u.class_id is not null), '{}'::text[])
    from public.users u
   where u.role::text = 'student' and (u.id::text = itqan.uid() or u.id::text = any(itqan.my_children()));
$$;

drop policy if exists gbm_family_select on public.gradebook_marks;
create policy gbm_family_select on public.gradebook_marks for select to anon, authenticated
  using (student_id = itqan.uid() or student_id = any(itqan.my_children()));

drop policy if exists gbc_family_select on public.gradebook_columns;
create policy gbc_family_select on public.gradebook_columns for select to anon, authenticated
  using (class_id = any(itqan.family_class_ids()));

drop policy if exists gbw_family_select on public.gradebook_weights;
create policy gbw_family_select on public.gradebook_weights for select to anon, authenticated
  using (itqan.uid() is not null);

grant execute on function itqan.family_class_ids() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 035: كشف الدرجات للطالب وولي الأمر' as result;
