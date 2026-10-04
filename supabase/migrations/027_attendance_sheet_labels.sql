-- =====================================================================
-- منصة إتقان: 027 — أسماء فصول «سجل فقط»
--  اسم يكتبه المسؤول لكل شيت «بدون حسابات» (مثل «الصف الأول الابتدائي»)
--  يظهر في اللوحة والفلاتر وسجل الطلاب بدل الاسم التلقائي.
--
-- يتطلب 022 و024 و025 و026 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table itqan.attendance_config add column if not exists sheet_labels jsonb not null default '{}'::jsonb;

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
    sheet_labels = case when jsonb_typeof(p -> 'sheet_labels') = 'object' then p -> 'sheet_labels' else sheet_labels end,
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

create or replace function public.itqan_attendance_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config;
begin
  if not (itqan.has_perm('can_view_attendance') or itqan.has_perm('can_manage_attendance')) then return null; end if;
  select * into v_cfg from itqan.attendance_config where id = 1;
  return jsonb_build_object(
    'start_date', v_cfg.start_date, 'weeks', v_cfg.weeks, 'threshold', v_cfg.threshold,
    'sheet_classes', v_cfg.sheet_classes, 'sheets', coalesce(v_cfg.seen_sheets, '{}'::jsonb), 'sheet_labels', coalesce(v_cfg.sheet_labels, '{}'::jsonb), 'has_token', v_cfg.token_hash is not null,
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'source', l.source, 'by', l.by_name, 'summary', l.summary) order by l.id desc), '[]'::jsonb)
            from (select * from itqan.attendance_sync_log order by id desc limit 10) l),
    'unmatched', (select coalesce(jsonb_agg(jsonb_build_object('sheet', u.sheet, 'name', u.raw_name, 'count', jsonb_array_length(u.marks)) order by u.sheet, u.raw_name), '[]'::jsonb)
                  from itqan.attendance_unmatched u));
end $$;

revoke all on function public.itqan_attendance_config() from public;
grant execute on function public.itqan_attendance_config() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 027: أسماء فصول «سجل فقط»' as result;
