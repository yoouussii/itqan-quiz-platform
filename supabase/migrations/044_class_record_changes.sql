-- =====================================================================
-- منصة إتقان: 044 — سجل تعديلات سجلات المتابعة (من عدّل، ومتى، وكم خلية)
--  - عند كل مزامنة لملف تغيّر: تُقارن كل ورقة بنسختها السابقة خلية بخلية،
--    ويُحفظ حدث تعديل: المعدِّل ووقت التعديل وعدد الخلايا المعدَّلة/المرصودة/الممسوحة.
--  - أول مزامنة للورقة تُحفظ كحدث «أول مزامنة» (initial) بوقت آخر تعديل معروف.
--  - تُحذف الأحداث الأقدم من 400 يوم تلقائياً.
--
-- يتطلب 043 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.class_record_changes (
  id             bigserial primary key,
  kind           text not null check (kind in ('followup', 'levels')),
  file_key       text not null,
  file_name      text not null default '',
  sheet_name     text not null,
  edited_by      text not null default '',
  edited_at      timestamptz not null,
  cells_changed  int not null default 0,
  cells_filled   int not null default 0,
  cells_cleared  int not null default 0,
  initial        boolean not null default false,
  source         text not null default 'drive',
  synced_at      timestamptz not null default now()
);
create index if not exists crc_edited_idx on public.class_record_changes (edited_at desc);
create index if not exists crc_file_idx on public.class_record_changes (kind, file_key);

alter table public.class_record_changes enable row level security;
revoke all on public.class_record_changes from public, anon, authenticated;
grant select on public.class_record_changes to anon, authenticated;
drop policy if exists crc_select on public.class_record_changes;
create policy crc_select on public.class_record_changes for select to anon, authenticated
  using (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records'));

-- مقارنة شبكتين خلية بخلية (الفراغ و null سواء)
create or replace function itqan.grid_diff(a jsonb, b jsonb, out changed int, out filled int, out cleared int)
language sql immutable set search_path = '' as $$
  with r as (
    select i from generate_series(0, greatest(jsonb_array_length(coalesce(a, '[]')), jsonb_array_length(coalesce(b, '[]'))) - 1) i
  ), c as (
    select r.i, j from r, generate_series(0, greatest(
      case when jsonb_typeof(a -> r.i) = 'array' then jsonb_array_length(a -> r.i) else 0 end,
      case when jsonb_typeof(b -> r.i) = 'array' then jsonb_array_length(b -> r.i) else 0 end) - 1) j
  ), v as (
    select nullif(nullif(a -> c.i -> c.j, 'null'::jsonb), '""'::jsonb) o,
           nullif(nullif(b -> c.i -> c.j, 'null'::jsonb), '""'::jsonb) n
      from c
  )
  select count(*) filter (where o is not null and n is not null and o <> n)::int,
         count(*) filter (where o is null and n is not null)::int,
         count(*) filter (where o is not null and n is null)::int
    from v
$$;

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
  if v_kind not in ('followup', 'levels') or coalesce(v_key, '') = '' or jsonb_typeof(p_payload -> 'sheets') <> 'array' then
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

revoke all on function public.itqan_records_import(jsonb, text) from public;
grant execute on function public.itqan_records_import(jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 044: سجل تعديلات سجلات المتابعة' as result;
