-- =====================================================================
-- منصة إتقان: 025 — تطبيق «سجل فقط» فوراً عند الحفظ
--  عند تحديد شيت كـ«سجل فقط (طلاب بدون حسابات)» وحفظ الإعداد، تُنقل أسماء هذا الشيت
--  التي لم تُطابق (من آخر مزامنة أو رفع) إلى قائمة الحضور مع حركاتها مباشرة،
--  بدون انتظار مزامنة جديدة من الشيت.
--
-- يتطلب 022 و024 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_attendance_config_save(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config; u itqan.attendance_unmatched; v_id text;
begin
  if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
  update itqan.attendance_config set
    start_date = case when p ? 'start_date' then nullif(p ->> 'start_date', '')::date else start_date end,
    weeks = case when p ? 'weeks' then least(greatest(coalesce((p ->> 'weeks')::int, 18), 1), 30) else weeks end,
    threshold = case when p ? 'threshold' then least(greatest(coalesce((p ->> 'threshold')::int, 3), 1), 60) else threshold end,
    sheet_classes = case when jsonb_typeof(p -> 'sheet_classes') = 'object' then p -> 'sheet_classes' else sheet_classes end,
    updated_at = now()
  where id = 1
  returning * into v_cfg;

  -- أسماء شيتات «سجل فقط» التي بقيت في «لم تُطابق» ← قائمة الحضور
  if v_cfg.start_date is not null then
    for u in select x.* from itqan.attendance_unmatched x where v_cfg.sheet_classes ->> x.sheet = '__roster__' loop
      insert into public.attendance_roster (sheet, name, name_norm)
      values (u.sheet, u.raw_name, u.name_norm)
      on conflict (sheet, name_norm) do update set name = excluded.name
      returning id into v_id;
      perform itqan.attendance_apply(v_id, u.marks, v_cfg.start_date, v_cfg.weeks);
      delete from itqan.attendance_unmatched x where x.sheet = u.sheet and x.name_norm = u.name_norm;
    end loop;
  end if;
end $$;

revoke all on function public.itqan_attendance_config_save(jsonb) from public;
grant execute on function public.itqan_attendance_config_save(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 025: تطبيق «سجل فقط» فوراً عند الحفظ' as result;
