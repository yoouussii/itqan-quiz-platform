-- =====================================================================
-- منصة إتقان: 028 — التحكم في «أسماء لم تُطابق» و«سجل المزامنة»
--  - تجاهل اسم (لا يعود مع كل مزامنة) وإلغاء التجاهل.
--  - تسجيل اسم من شيت «طلاب المنصة» كطالب «بدون حساب» (مثل طالب في صف نافس ليس له حساب).
--  - حذف سطر من سجل المزامنة أو مسح السجل كله.
--
-- يتطلب 022 و024 و026 و027 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_attendance_import(p_payload jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.attendance_config;
  v_source text; v_by text := '';
  s jsonb; st jsonb; v_sheet text; v_class text; v_id text; v_roster boolean; v_seen text[]; v_n int; v_bad int;
  v_matched int := 0; v_marks int := 0; v_unmatched jsonb := '[]'::jsonb; v_sheets int := 0; v_roster_n int := 0;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  if p_token is not null and p_token <> '' then
    if v_cfg.token_hash is null or itqan.hash_token(p_token) <> v_cfg.token_hash then
      raise exception 'invalid_token';
    end if;
    v_source := 'sheet_sync';
  else
    if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
    v_source := 'upload';
    select coalesce(u.name, '') into v_by from public.users u where u.id::text = itqan.uid();
  end if;
  if v_cfg.start_date is null then raise exception 'no_start_date'; end if;
  if jsonb_typeof(p_payload -> 'sheets') <> 'array' then raise exception 'bad_payload'; end if;

  for s in select * from jsonb_array_elements(p_payload -> 'sheets') loop
    v_sheets := v_sheets + 1;
    v_sheet := btrim(s ->> 'sheet');
    v_class := nullif(v_cfg.sheet_classes ->> v_sheet, '');
    v_roster := v_class = '__roster__';
    if v_roster then v_class := null; end if;
    v_seen := '{}'; v_n := 0; v_bad := 0;
    delete from itqan.attendance_unmatched u where u.sheet = v_sheet;

    for st in select * from jsonb_array_elements(coalesce(s -> 'students', '[]'::jsonb)) loop
      continue when itqan.norm_name(st ->> 'name') = '';
      v_n := v_n + 1;
      if v_roster then
        insert into public.attendance_roster (sheet, name, name_norm)
        values (v_sheet, btrim(st ->> 'name'), itqan.norm_name(st ->> 'name'))
        on conflict (sheet, name_norm) do update set name = excluded.name
        returning id into v_id;
        v_seen := v_seen || v_id;
        v_roster_n := v_roster_n + 1;
      else
        v_id := itqan.attendance_resolve(st ->> 'name', v_class);
        -- اسم متجاهَل: لا يُسجَّل ولا يظهر في «لم تُطابق»
        continue when v_id = '__ignore__';
        -- اسم رُبط بطالب «بدون حساب» من هذا الشيت: يبقى في القائمة
        if v_id like 'R-%' then v_seen := v_seen || v_id; end if;
      end if;

      if v_id is null then
        insert into itqan.attendance_unmatched (sheet, name_norm, raw_name, marks)
        values (v_sheet, itqan.norm_name(st ->> 'name'), btrim(st ->> 'name'), coalesce(st -> 'marks', '[]'::jsonb))
        on conflict (sheet, name_norm) do update set marks = excluded.marks, raw_name = excluded.raw_name;
        v_unmatched := v_unmatched || jsonb_build_object('sheet', v_sheet, 'name', btrim(st ->> 'name'));
        v_bad := v_bad + 1;
      else
        v_matched := v_matched + 1;
        v_marks := v_marks + itqan.attendance_apply(v_id, st -> 'marks', v_cfg.start_date, v_cfg.weeks);
      end if;
    end loop;

    -- من لم يعد في الشيت (أو تحوّل الشيت لطلاب المنصة): تُحذف حركاته من الشيت، ويُحذف من القائمة إن لم تكن له حركات يدوية
    delete from public.attendance_records r
    using public.attendance_roster ro
    where ro.sheet = v_sheet and not (ro.id = any(v_seen)) and r.student_id = ro.id and r.source = 'sheet';
    delete from public.attendance_roster ro
    where ro.sheet = v_sheet and not (ro.id = any(v_seen))
      and not exists (select 1 from public.attendance_records r where r.student_id = ro.id);

    -- آخر ما وصل من هذا الشيت (لعرض كل الشيتات في صفحة الربط)
    update itqan.attendance_config
    set seen_sheets = coalesce(seen_sheets, '{}'::jsonb) || jsonb_build_object(v_sheet, jsonb_build_object('students', v_n, 'unmatched', v_bad, 'at', now()))
    where id = 1;
  end loop;

  insert into itqan.attendance_sync_log (source, by_name, summary)
  values (v_source, v_by, jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks,
          'unmatched', jsonb_array_length(v_unmatched), 'roster', v_roster_n));
  delete from itqan.attendance_sync_log where id not in (select id from itqan.attendance_sync_log order by id desc limit 50);

  return jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks, 'unmatched', v_unmatched, 'roster', v_roster_n);
end $$;

revoke all on function public.itqan_attendance_import(jsonb, text) from public;
grant execute on function public.itqan_attendance_import(jsonb, text) to anon, authenticated;

create or replace function public.itqan_attendance_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config;
begin
  if not (itqan.has_perm('can_view_attendance') or itqan.has_perm('can_manage_attendance')) then return null; end if;
  select * into v_cfg from itqan.attendance_config where id = 1;
  return jsonb_build_object(
    'start_date', v_cfg.start_date, 'weeks', v_cfg.weeks, 'threshold', v_cfg.threshold,
    'sheet_classes', v_cfg.sheet_classes, 'sheets', coalesce(v_cfg.seen_sheets, '{}'::jsonb), 'sheet_labels', coalesce(v_cfg.sheet_labels, '{}'::jsonb), 'has_token', v_cfg.token_hash is not null,
    'log', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'source', l.source, 'by', l.by_name, 'summary', l.summary) order by l.id desc), '[]'::jsonb)
            from (select * from itqan.attendance_sync_log order by id desc limit 10) l),
    'ignored', (select coalesce(jsonb_agg(a.name_norm order by a.name_norm), '[]'::jsonb) from itqan.attendance_aliases a where a.student_id = '__ignore__'),
    'unmatched', (select coalesce(jsonb_agg(jsonb_build_object('sheet', u.sheet, 'name', u.raw_name, 'count', jsonb_array_length(u.marks)) order by u.sheet, u.raw_name), '[]'::jsonb)
                  from itqan.attendance_unmatched u));
end $$;

revoke all on function public.itqan_attendance_config() from public;
grant execute on function public.itqan_attendance_config() to anon, authenticated;

-- p_action: ignore (تجاهل) | roster (تسجيل بدون حساب) | unignore (إلغاء التجاهل؛ p_name هو الاسم الموحَّد)
create or replace function public.itqan_attendance_unmatched_action(p_sheet text, p_name text, p_action text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config; v_u itqan.attendance_unmatched; v_norm text := itqan.norm_name(p_name); v_id text; v_n int := 0;
begin
  if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
  if v_norm = '' then raise exception 'bad_name'; end if;
  if p_action = 'unignore' then
    delete from itqan.attendance_aliases a where a.name_norm = v_norm and a.student_id = '__ignore__';
    return 0;
  end if;
  select * into v_u from itqan.attendance_unmatched u where u.sheet = p_sheet and u.name_norm = v_norm;
  if p_action = 'ignore' then
    insert into itqan.attendance_aliases (name_norm, student_id) values (v_norm, '__ignore__')
    on conflict (name_norm) do update set student_id = excluded.student_id;
  elsif p_action = 'roster' then
    if not found then raise exception 'not_found'; end if;
    select * into v_cfg from itqan.attendance_config where id = 1;
    insert into public.attendance_roster (sheet, name, name_norm) values (p_sheet, v_u.raw_name, v_norm)
    on conflict (sheet, name_norm) do update set name = excluded.name
    returning id into v_id;
    insert into itqan.attendance_aliases (name_norm, student_id) values (v_norm, v_id)
    on conflict (name_norm) do update set student_id = excluded.student_id;
    if v_cfg.start_date is not null then v_n := itqan.attendance_apply(v_id, v_u.marks, v_cfg.start_date, v_cfg.weeks); end if;
  else
    raise exception 'bad_action';
  end if;
  delete from itqan.attendance_unmatched u where u.sheet = p_sheet and u.name_norm = v_norm;
  return v_n;
end $$;

-- حذف سطر من سجل المزامنة، أو مسحه كله (p_id = null)
create or replace function public.itqan_attendance_log_clear(p_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
  delete from itqan.attendance_sync_log l where p_id is null or l.id = p_id;
end $$;

revoke all on function public.itqan_attendance_unmatched_action(text, text, text), public.itqan_attendance_log_clear(bigint) from public;
grant execute on function public.itqan_attendance_unmatched_action(text, text, text), public.itqan_attendance_log_clear(bigint) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 028: التحكم في الأسماء غير المطابقة وسجل المزامنة' as result;
