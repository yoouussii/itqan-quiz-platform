-- =====================================================================
-- منصة إتقان: 043 — سجلات المتابعة الصفية وتتبع مستويات الطلاب (من Google Drive)
--  - نوعان: followup (سجل المتابعة: ملف لكل معلم، شيت لكل مادة وصف)
--           levels   (تتبع المستويات: ملف لكل مرحلة، شيت لكل فصل، 4 قياسات لكل مادة)
--  - كل شيت يُحفظ كما هو (شبكة قيم) ويُقرأ في الموقع؛ فلا يتعطل الربط إن تغيّر شكل الأعمدة.
--  - آخر تعديل للملف (من Drive): الاسم والوقت، لمتابعة المعلمين.
--  - المصادر: Apps Script مركزي يقرأ مجلدات Drive (برمز ربط) أو رفع Excel يدوياً.
--  - الصلاحيات: can_view_class_records (عرض) و can_manage_class_records (ربط ورفع وحذف).
--
-- يتطلب 003 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.class_record_sheets (
  id             bigserial primary key,
  kind           text not null check (kind in ('followup', 'levels')),
  file_key       text not null check (length(file_key) between 1 and 200),
  file_name      text not null default '' check (length(file_name) <= 200),
  folder_path    text not null default '' check (length(folder_path) <= 300),
  sheet_name     text not null check (length(sheet_name) between 1 and 120),
  grid           jsonb not null,
  last_edit_by   text not null default '',
  last_edit_at   timestamptz,
  source         text not null default 'drive' check (source in ('drive', 'upload')),
  synced_at      timestamptz not null default now(),
  unique (kind, file_key, sheet_name)
);
create index if not exists crs_kind_idx on public.class_record_sheets (kind, file_key);

alter table public.class_record_sheets enable row level security;
revoke all on public.class_record_sheets from public, anon, authenticated;
grant select, delete on public.class_record_sheets to anon, authenticated;

drop policy if exists crs_select on public.class_record_sheets;
create policy crs_select on public.class_record_sheets for select to anon, authenticated
  using (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records'));
drop policy if exists crs_delete on public.class_record_sheets;
create policy crs_delete on public.class_record_sheets for delete to anon, authenticated
  using (itqan.has_perm('can_manage_class_records'));

-- إعداد الربط: رمز Apps Script، ومجلدات Drive، وسجل المزامنة
create table if not exists itqan.records_config (
  id          int primary key default 1 check (id = 1),
  token_hash  text,
  folders     jsonb not null default '[]'::jsonb,
  last_sync   timestamptz,
  log         jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into itqan.records_config (id) values (1) on conflict do nothing;
alter table itqan.records_config enable row level security;
revoke all on itqan.records_config from public, anon, authenticated;

-- استيراد/مزامنة: { kind, file_key, file_name, folder_path, last_edit_by, last_edit_at, full, source, sheets: [{ sheet, grid }] }
-- full = true: تُحذف شيتات الملف التي لم تعد موجودة
create or replace function public.itqan_records_import(p_payload jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.records_config; s jsonb; v_kind text; v_key text; v_n int := 0; v_names text[] := '{}'; v_rows int;
  v_by text; v_src text;
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

  for s in select * from jsonb_array_elements(p_payload -> 'sheets') loop
    if jsonb_typeof(s -> 'grid') <> 'array' or coalesce(s ->> 'sheet', '') = '' then continue; end if;
    v_rows := jsonb_array_length(s -> 'grid');
    if v_rows < 2 or v_rows > 400 then continue; end if;
    if octet_length((s -> 'grid')::text) > 400000 then continue; end if;
    insert into public.class_record_sheets (kind, file_key, file_name, folder_path, sheet_name, grid, last_edit_by, last_edit_at, source, synced_at)
    values (v_kind, v_key, left(coalesce(p_payload ->> 'file_name', v_key), 200), left(coalesce(p_payload ->> 'folder_path', ''), 300),
            left(trim(s ->> 'sheet'), 120), s -> 'grid', v_by,
            coalesce(nullif(p_payload ->> 'last_edit_at', '')::timestamptz, now()), v_src, now())
    on conflict (kind, file_key, sheet_name) do update set
      file_name = excluded.file_name, folder_path = excluded.folder_path, grid = excluded.grid,
      last_edit_by = excluded.last_edit_by, last_edit_at = excluded.last_edit_at, source = excluded.source, synced_at = now();
    v_names := v_names || left(trim(s ->> 'sheet'), 120);
    v_n := v_n + 1;
  end loop;

  if coalesce((p_payload ->> 'full')::boolean, false) then
    delete from public.class_record_sheets c where c.kind = v_kind and c.file_key = v_key and not (c.sheet_name = any(v_names));
  end if;

  update itqan.records_config set last_sync = now(),
    log = (jsonb_build_array(jsonb_build_object('at', now(), 'kind', v_kind, 'file', left(coalesce(p_payload ->> 'file_name', v_key), 200), 'sheets', v_n, 'source', v_src))
           || coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(log) x limit 49) y), '[]'::jsonb))
   where id = 1;
  return jsonb_build_object('sheets', v_n);
end $$;

-- حذف ملفات لم تعد في المجلد (Apps Script يرسل قائمة الملفات الحالية)
create or replace function public.itqan_records_prune(p_kind text, p_keys text[], p_token text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.records_config; n int;
begin
  select * into v_cfg from itqan.records_config where id = 1;
  if v_cfg.token_hash is null or itqan.hash_token(coalesce(p_token, '')) <> v_cfg.token_hash then raise exception 'invalid_token'; end if;
  if p_kind not in ('followup', 'levels') or coalesce(array_length(p_keys, 1), 0) = 0 then return 0; end if;
  delete from public.class_record_sheets where kind = p_kind and source = 'drive' and not (file_key = any(p_keys));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.itqan_records_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v itqan.records_config;
begin
  if not (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records')) then return null; end if;
  select * into v from itqan.records_config where id = 1;
  return jsonb_build_object('has_token', v.token_hash is not null, 'folders', v.folders, 'last_sync', v.last_sync,
    'log', case when itqan.has_perm('can_manage_class_records') then v.log else '[]'::jsonb end);
end $$;

create or replace function public.itqan_records_setup(p_folders jsonb, p_new_token boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not itqan.has_perm('can_manage_class_records') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_folders) <> 'array' then raise exception 'bad_payload'; end if;
  update itqan.records_config set folders = p_folders, updated_at = now() where id = 1;
  if p_new_token then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update itqan.records_config set token_hash = itqan.hash_token(v_token) where id = 1;
  end if;
  return v_token;
end $$;

revoke all on function public.itqan_records_import(jsonb, text), public.itqan_records_prune(text, text[], text),
  public.itqan_records_config(), public.itqan_records_setup(jsonb, boolean) from public;
grant execute on function public.itqan_records_import(jsonb, text), public.itqan_records_prune(text, text[], text),
  public.itqan_records_config(), public.itqan_records_setup(jsonb, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 043: سجلات المتابعة الصفية وتتبع المستويات' as result;
