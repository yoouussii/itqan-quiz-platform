-- =====================================================================
-- منصة إتقان: 073 — تجاهل النسخة المؤقتة «itqan-tmp» في سجلات المتابعة
--  سكربت Drive يقرأ ملفات Excel بنسخة مؤقتة محوّلة اسمها itqan-tmp ثم يحذفها. إن بقيت في المجلد
--  (نُقلت للمهملات بدل الحذف، أو فُحص المجلد أثناء وجودها) كانت تُستورد كأنها ملف معلم جديد.
--  - حذف ما استُورد منها.
--  - مشغّل يرفض أي صف باسم itqan-tmp مستقبلاً، فلا يلزم إعادة لصق السكربت لإصلاح الأرقام.
--
-- يتطلب 043 و044. آمن لإعادة التشغيل.
-- =====================================================================

delete from public.class_record_changes where file_name = 'itqan-tmp';
delete from public.class_record_sheets where file_name = 'itqan-tmp';

create or replace function itqan.records_skip_temp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.file_name = 'itqan-tmp' then return null; end if;
  return new;
end $$;

drop trigger if exists itqan_records_skip_temp on public.class_record_sheets;
create trigger itqan_records_skip_temp before insert or update on public.class_record_sheets
  for each row execute function itqan.records_skip_temp();
drop trigger if exists itqan_records_changes_skip_temp on public.class_record_changes;
create trigger itqan_records_changes_skip_temp before insert or update on public.class_record_changes
  for each row execute function itqan.records_skip_temp();

select '✓ تم تحديث 073: تجاهل النسخة المؤقتة itqan-tmp' as result;
