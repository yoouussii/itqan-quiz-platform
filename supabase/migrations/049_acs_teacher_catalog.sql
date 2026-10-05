-- =====================================================================
-- منصة إتقان: 049 — معلم الدعم ينشئ فصوله وموادّه
--  - صاحب صلاحية can_academic_support ينشئ مواد دعم وفصول دعم لنفسه (الفصل يُسند له تلقائياً)،
--    ويعدّل ويحذف ما أنشأه فقط.
--  - المدير وصاحب can_manage_acs_catalog يديران الكل كما في 047 (ويُسندان الفصل لأي معلم).
--  - ربط الطالب بفصل دعم: فصل المعلم نفسه أو فصل بلا معلم (والمدير أي فصل).
--
-- يتطلب 047 قبله. آمن لإعادة التشغيل.
-- =====================================================================

drop policy if exists acsub_write on public.acs_subjects;
drop policy if exists acsub_insert on public.acs_subjects;
create policy acsub_insert on public.acs_subjects for insert to anon, authenticated
  with check (itqan.acs_catalog_manager() or (itqan.has_perm('can_academic_support') and created_by = itqan.uid()));
drop policy if exists acsub_update on public.acs_subjects;
create policy acsub_update on public.acs_subjects for update to anon, authenticated
  using (itqan.acs_catalog_manager() or (itqan.has_perm('can_academic_support') and created_by = itqan.uid()))
  with check (itqan.acs_catalog_manager() or created_by = itqan.uid());
drop policy if exists acsub_delete on public.acs_subjects;
create policy acsub_delete on public.acs_subjects for delete to anon, authenticated
  using (itqan.acs_catalog_manager() or (itqan.has_perm('can_academic_support') and created_by = itqan.uid()));

drop policy if exists acscl_write on public.acs_classes;
drop policy if exists acscl_insert on public.acs_classes;
create policy acscl_insert on public.acs_classes for insert to anon, authenticated
  with check (itqan.acs_catalog_manager()
              or (itqan.has_perm('can_academic_support') and created_by = itqan.uid() and teacher_id = itqan.uid()));
drop policy if exists acscl_update on public.acs_classes;
create policy acscl_update on public.acs_classes for update to anon, authenticated
  using (itqan.acs_catalog_manager() or (itqan.has_perm('can_academic_support') and teacher_id = itqan.uid()))
  with check (itqan.acs_catalog_manager() or teacher_id = itqan.uid());
drop policy if exists acscl_delete on public.acs_classes;
create policy acscl_delete on public.acs_classes for delete to anon, authenticated
  using (itqan.acs_catalog_manager() or (itqan.has_perm('can_academic_support') and teacher_id = itqan.uid()));

-- لا يربط المعلم طالباً بفصل دعم لمعلم آخر
create or replace function itqan.acs_class_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_teacher text;
begin
  if new.acs_class_id is null or itqan.is_admin() or itqan.has_perm('can_manage_acs_catalog') then return new; end if;
  if tg_op = 'UPDATE' and new.acs_class_id is not distinct from old.acs_class_id then return new; end if;
  select teacher_id into v_teacher from public.acs_classes where id = new.acs_class_id;
  if v_teacher is not null and v_teacher <> new.teacher_id then raise exception 'acs_class_not_yours'; end if;
  return new;
end $$;
drop trigger if exists acs_class_guard on public.academic_support;
create trigger acs_class_guard before insert or update of acs_class_id on public.academic_support
  for each row execute function itqan.acs_class_guard();

notify pgrst, 'reload schema';

select '✓ تم تحديث 049: معلم الدعم ينشئ فصوله وموادّه' as result;
