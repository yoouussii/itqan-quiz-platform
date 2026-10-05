-- =====================================================================
-- منصة إتقان: 045 — تعبئة سجل التعديلات للسجلات الموجودة قبل 044
--  - كل ورقة ليس لها أي حدث تعديل بعد: يُضاف لها حدث «أول مزامنة» بوقت آخر تعديل معروف
--    ومعدِّله وعدد الخلايا المرصودة، كي تظهر في لوحة المتابعة فوراً.
--
-- يتطلب 044 قبله. آمن لإعادة التشغيل (لا يكرر الأحداث).
-- =====================================================================

insert into public.class_record_changes (kind, file_key, file_name, sheet_name, edited_by, edited_at, cells_filled, initial, source)
select s.kind, s.file_key, s.file_name, s.sheet_name, s.last_edit_by, coalesce(s.last_edit_at, s.synced_at),
       (itqan.grid_diff('[]'::jsonb, s.grid)).filled, true, s.source
  from public.class_record_sheets s
 where not exists (select 1 from public.class_record_changes c
                    where c.kind = s.kind and c.file_key = s.file_key and c.sheet_name = s.sheet_name);

select '✓ تم تحديث 045: تعبئة سجل التعديلات (' || (select count(*) from public.class_record_changes where initial) || ' حدث أول مزامنة)' as result;
