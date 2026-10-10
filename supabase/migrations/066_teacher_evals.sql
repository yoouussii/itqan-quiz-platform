-- =====================================================================
-- منصة إتقان: 066 — تقييم المعلمين ضمن سجلات المتابعة
--  - نوع ثالث في سجلات المتابعة: teachers (ملف تقييم المعلمين من Drive أو رفع Excel).
--  - بياناته حساسة (الهوية والجوال والأداء الوظيفي): لا يراها إلا من يدير السجلات
--    أو من لديه صلاحية can_view_teacher_evals (المدير يملك كل الصلاحيات).
--
-- يتطلب 043 و044 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.class_record_sheets drop constraint if exists class_record_sheets_kind_check;
alter table public.class_record_sheets add constraint class_record_sheets_kind_check check (kind in ('followup', 'levels', 'teachers'));
alter table public.class_record_changes drop constraint if exists class_record_changes_kind_check;
alter table public.class_record_changes add constraint class_record_changes_kind_check check (kind in ('followup', 'levels', 'teachers'));

-- من يرى أي نوع؟
create or replace function itqan.records_kind_visible(p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_kind = 'teachers'
    then itqan.has_perm('can_manage_class_records') or itqan.has_perm('can_view_teacher_evals')
    else itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records') end;
$$;
grant execute on function itqan.records_kind_visible(text) to anon, authenticated;

drop policy if exists crs_select on public.class_record_sheets;
create policy crs_select on public.class_record_sheets for select to anon, authenticated
  using (itqan.records_kind_visible(kind));
drop policy if exists crc_select on public.class_record_changes;
create policy crc_select on public.class_record_changes for select to anon, authenticated
  using (itqan.records_kind_visible(kind));

create or replace function public.itqan_records_import(p_payload jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.records_config; s jsonb; v_kind text; v_key text; v_n int := 0; v_names text[] := '{}'; v_rows int;
  v_by text; v_src text; v_at timestamptz; v_sheet text; v_old jsonb; d record;
begin
  select * into v_cfg from itqan.records_config where id = 1;
  if p_token is not null and p_token <> '' then
    if v_cfg.token_hash is null or itqan.hash_token(p_token) <> v_cfg.token_hash then raise exception 'invalid_token'; end if;
    v_src := 'drive';
  else
    if not itqan.has_perm('can_manage_class_records') then raise exception 'forbidden'; end if;
    v_src := 'upload';
  end if;
  v_kind := p_payload ->> 'kind';
  v_key := left(coalesce(nullif(p_payload ->> 'file_key', ''), p_payload ->> 'file_name'), 200);
  if v_kind not in ('followup', 'levels', 'teachers') or coalesce(v_key, '') = '' or jsonb_typeof(p_payload -> 'sheets') <> 'array' then
    raise exception 'bad_payload';
  end if;
  if jsonb_array_length(p_payload -> 'sheets') > 60 then raise exception 'too_many_sheets'; end if;
  v_by := left(coalesce(p_payload ->> 'last_edit_by', ''), 120);
  if v_src = 'upload' and v_by = '' then
    select coalesce(u.name, '') into v_by from public.users u where u.id::text = itqan.uid();
  end if;
  v_at := coalesce(nullif(p_payload ->> 'last_edit_at', '')::timestamptz, now());

  for s in select * from jsonb_array_elements(p_payload -> 'sheets') loop
    if jsonb_typeof(s -> 'grid') <> 'array' or coalesce(s ->> 'sheet', '') = '' then continue; end if;
    v_rows := jsonb_array_length(s -> 'grid');
    if v_rows < 2 or v_rows > 400 then continue; end if;
    if octet_length((s -> 'grid')::text) > 400000 then continue; end if;
    v_sheet := left(trim(s ->> 'sheet'), 120);

    -- حدث التعديل: مقارنة بالنسخة السابقة
    select c.grid into v_old from public.class_record_sheets c where c.kind = v_kind and c.file_key = v_key and c.sheet_name = v_sheet;
    if not found then
      select * into d from itqan.grid_diff('[]'::jsonb, s -> 'grid');
      insert into public.class_record_changes (kind, file_key, file_name, sheet_name, edited_by, edited_at, cells_filled, initial, source)
      values (v_kind, v_key, left(coalesce(p_payload ->> 'file_name', v_key), 200), v_sheet, v_by, v_at, d.filled, true, v_src);
    elsif v_old is distinct from s -> 'grid' then
      select * into d from itqan.grid_diff(v_old, s -> 'grid');
      if d.changed + d.filled + d.cleared > 0 then
        insert into public.class_record_changes (kind, file_key, file_name, sheet_name, edited_by, edited_at, cells_changed, cells_filled, cells_cleared, source)
        values (v_kind, v_key, left(coalesce(p_payload ->> 'file_name', v_key), 200), v_sheet, v_by, v_at, d.changed, d.filled, d.cleared, v_src);
      end if;
    end if;

    insert into public.class_record_sheets (kind, file_key, file_name, folder_path, sheet_name, grid, last_edit_by, last_edit_at, source, synced_at)
    values (v_kind, v_key, left(coalesce(p_payload ->> 'file_name', v_key), 200), left(coalesce(p_payload ->> 'folder_path', ''), 300),
            v_sheet, s -> 'grid', v_by, v_at, v_src, now())
    on conflict (kind, file_key, sheet_name) do update set
      file_name = excluded.file_name, folder_path = excluded.folder_path, grid = excluded.grid,
      last_edit_by = excluded.last_edit_by, last_edit_at = excluded.last_edit_at, source = excluded.source, synced_at = now();
    v_names := v_names || v_sheet;
    v_n := v_n + 1;
  end loop;

  if coalesce((p_payload ->> 'full')::boolean, false) then
    delete from public.class_record_sheets c where c.kind = v_kind and c.file_key = v_key and not (c.sheet_name = any(v_names));
  end if;

  delete from public.class_record_changes where edited_at < now() - interval '400 days';

  update itqan.records_config set last_sync = now(),
    log = (jsonb_build_array(jsonb_build_object('at', now(), 'kind', v_kind, 'file', left(coalesce(p_payload ->> 'file_name', v_key), 200), 'sheets', v_n, 'source', v_src))
           || coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(log) x limit 49) y), '[]'::jsonb))
   where id = 1;
  return jsonb_build_object('sheets', v_n);
end $$;

create or replace function public.itqan_records_prune(p_kind text, p_keys text[], p_token text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.records_config; n int;
begin
  select * into v_cfg from itqan.records_config where id = 1;
  if v_cfg.token_hash is null or itqan.hash_token(coalesce(p_token, '')) <> v_cfg.token_hash then raise exception 'invalid_token'; end if;
  if p_kind not in ('followup', 'levels', 'teachers') or coalesce(array_length(p_keys, 1), 0) = 0 then return 0; end if;
  delete from public.class_record_sheets where kind = p_kind and source = 'drive' and not (file_key = any(p_keys));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.itqan_records_import(jsonb, text), public.itqan_records_prune(text, text[], text) from public;
grant execute on function public.itqan_records_import(jsonb, text), public.itqan_records_prune(text, text[], text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 066: تقييم المعلمين ضمن سجلات المتابعة' as result;
