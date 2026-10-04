-- =====================================================================
-- منصة إتقان: 024 — طلاب الحضور بلا حسابات (سجل فقط)
--  بعض الصفوف ليست على المنصة كحسابات (مثلاً الصفوف غير المشمولة باختبارات نافس)،
--  لكن المدرسة تريد متابعة غيابهم وتأخرهم واستئذانهم.
--  - في «الربط والاستيراد» يُختار للشيت «سجل فقط (بدون حسابات)».
--  - أسماء هذا الشيت تُحفظ في attendance_roster (بلا دخول ولا ولي أمر ولا ظهور في المستخدمين)،
--    وتُسجَّل حركاتها في attendance_records كأي طالب.
--  - من يُحذف من الشيت يُحذف من القائمة مع حركاته من الشيت (ما لم تُسجَّل له حركات يدوية).
--
-- يتطلب 022 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.attendance_roster (
  id         text primary key default ('R-' || encode(extensions.gen_random_bytes(6), 'hex')),
  sheet      text not null,
  name       text not null,
  name_norm  text not null,
  created_at timestamptz not null default now(),
  unique (sheet, name_norm)
);

alter table public.attendance_roster enable row level security;
revoke all on public.attendance_roster from public, anon, authenticated;
grant select on public.attendance_roster to anon, authenticated;

drop policy if exists attendance_roster_select on public.attendance_roster;
create policy attendance_roster_select on public.attendance_roster for select to anon, authenticated
  using (itqan.has_perm('can_view_attendance') or itqan.has_perm('can_manage_attendance'));

-- قيمة خاصة في sheet_classes: الشيت «سجل فقط»
-- (اسم الشيت ← '__roster__')

create or replace function public.itqan_attendance_import(p_payload jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.attendance_config;
  v_source text; v_by text := '';
  s jsonb; st jsonb; v_sheet text; v_class text; v_id text; v_roster boolean; v_seen text[];
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
    v_seen := '{}';
    delete from itqan.attendance_unmatched u where u.sheet = v_sheet;

    for st in select * from jsonb_array_elements(coalesce(s -> 'students', '[]'::jsonb)) loop
      continue when itqan.norm_name(st ->> 'name') = '';
      if v_roster then
        insert into public.attendance_roster (sheet, name, name_norm)
        values (v_sheet, btrim(st ->> 'name'), itqan.norm_name(st ->> 'name'))
        on conflict (sheet, name_norm) do update set name = excluded.name
        returning id into v_id;
        v_seen := v_seen || v_id;
        v_roster_n := v_roster_n + 1;
      else
        v_id := itqan.attendance_resolve(st ->> 'name', v_class);
      end if;

      if v_id is null then
        insert into itqan.attendance_unmatched (sheet, name_norm, raw_name, marks)
        values (v_sheet, itqan.norm_name(st ->> 'name'), btrim(st ->> 'name'), coalesce(st -> 'marks', '[]'::jsonb))
        on conflict (sheet, name_norm) do update set marks = excluded.marks, raw_name = excluded.raw_name;
        v_unmatched := v_unmatched || jsonb_build_object('sheet', v_sheet, 'name', btrim(st ->> 'name'));
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
  end loop;

  insert into itqan.attendance_sync_log (source, by_name, summary)
  values (v_source, v_by, jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks,
          'unmatched', jsonb_array_length(v_unmatched), 'roster', v_roster_n));
  delete from itqan.attendance_sync_log where id not in (select id from itqan.attendance_sync_log order by id desc limit 50);

  return jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks, 'unmatched', v_unmatched, 'roster', v_roster_n);
end $$;

revoke all on function public.itqan_attendance_import(jsonb, text) from public;
grant execute on function public.itqan_attendance_import(jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 024: طلاب الحضور بلا حسابات (سجل فقط) = ' || (select count(*) from public.attendance_roster) as result;
