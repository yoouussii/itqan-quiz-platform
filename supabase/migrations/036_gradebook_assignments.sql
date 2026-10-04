-- =====================================================================
-- منصة إتقان: 036 — كشف الدرجات حسب الإسناد
--  المعلم يضيف أعمدة يدوية لفصوله وموادّه المسندة فقط (المدير لأي فصل).
--
-- يتطلب 033 قبله. آمن لإعادة التشغيل.
-- =====================================================================

-- هل الفصل والمادة ضمن إسناد المستخدم الحالي؟
create or replace function itqan.teaches(p_class text, p_subject text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
     where u.id::text = itqan.uid()
       and (coalesce(u.assigned_class_ids, '[]'::jsonb) ? p_class or u.class_id = p_class)
       and (coalesce(u.assigned_subject_ids, '[]'::jsonb) ? p_subject
            or (jsonb_array_length(coalesce(u.assigned_subject_ids, '[]'::jsonb)) = 0 and u.specialty_id = p_subject))
  );
$$;

drop policy if exists gbc_insert on public.gradebook_columns;
create policy gbc_insert on public.gradebook_columns for insert to anon, authenticated
  with check (created_by = itqan.uid()
              and (itqan.is_admin() or (itqan.my_role() = 'teacher' and itqan.teaches(class_id, subject_id))));

grant execute on function itqan.teaches(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 036: كشف الدرجات حسب الإسناد' as result;
