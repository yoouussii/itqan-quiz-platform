-- =====================================================================
-- منصة إتقان: 064 — مزامنة سجلات المتابعة كل دقيقة وعند الطلب
--  - كود Apps Script يسأل المنصة كل دقيقة (طلب خفيف): هل طُلب تحديث؟ هل حان موعد الفحص؟
--  - زر «تحديث الآن» في المنصة يطلب مزامنة فورية تُنفَّذ خلال دقيقة.
--  - المسؤول يحدد كل كم دقيقة يُفحص Drive تلقائياً (1، 5، 10، 15، 30).
--  - last_poll: آخر اتصال من الكود (لمعرفة أنه يعمل)، last_scan: آخر فحص كامل للمجلدات.
--
-- يتطلب 043 و046 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table itqan.records_config add column if not exists sync_requested_at timestamptz;
alter table itqan.records_config add column if not exists sync_interval int not null default 10;
alter table itqan.records_config add column if not exists last_poll timestamptz;
alter table itqan.records_config add column if not exists last_scan timestamptz;
do $$ begin
  alter table itqan.records_config add constraint records_config_interval_chk check (sync_interval in (1, 5, 10, 15, 30));
exception when duplicate_object then null; end $$;

-- الكود يسأل كل دقيقة: { requested_at, interval, last_scan, now }
create or replace function public.itqan_records_poll(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v itqan.records_config;
begin
  select * into v from itqan.records_config where id = 1;
  if v.token_hash is null or itqan.hash_token(coalesce(p_token, '')) <> v.token_hash then raise exception 'invalid_token'; end if;
  update itqan.records_config set last_poll = now() where id = 1;
  return jsonb_build_object('requested_at', v.sync_requested_at, 'interval', v.sync_interval, 'last_scan', v.last_scan, 'now', now());
end $$;

-- انتهى فحص كامل بدأ في p_started (طلب التحديث الأحدث منه يبقى قائماً)
create or replace function public.itqan_records_scanned(p_token text, p_started timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v itqan.records_config;
begin
  select * into v from itqan.records_config where id = 1;
  if v.token_hash is null or itqan.hash_token(coalesce(p_token, '')) <> v.token_hash then raise exception 'invalid_token'; end if;
  update itqan.records_config set last_scan = least(coalesce(p_started, now()), now()) where id = 1;
end $$;

-- زر «تحديث الآن»: لمن يرى السجلات
create or replace function public.itqan_records_request_sync()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz := now();
begin
  if not (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records')) then raise exception 'forbidden'; end if;
  update itqan.records_config set sync_requested_at = v_at where id = 1;
  return v_at;
end $$;

create or replace function public.itqan_records_set_interval(p_minutes int)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.has_perm('can_manage_class_records') then raise exception 'forbidden'; end if;
  if p_minutes not in (1, 5, 10, 15, 30) then raise exception 'bad_interval'; end if;
  update itqan.records_config set sync_interval = p_minutes, updated_at = now() where id = 1;
  return p_minutes;
end $$;

create or replace function public.itqan_records_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v itqan.records_config;
begin
  if not (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records')) then return null; end if;
  select * into v from itqan.records_config where id = 1;
  return jsonb_build_object('has_token', v.token_hash is not null, 'folders', v.folders, 'last_sync', v.last_sync, 'tools', v.tools,
    'sync_requested_at', v.sync_requested_at, 'sync_interval', v.sync_interval, 'last_poll', v.last_poll, 'last_scan', v.last_scan,
    'log', case when itqan.has_perm('can_manage_class_records') then v.log else '[]'::jsonb end);
end $$;

revoke all on function public.itqan_records_poll(text), public.itqan_records_scanned(text, timestamptz),
  public.itqan_records_request_sync(), public.itqan_records_set_interval(int), public.itqan_records_config() from public;
grant execute on function public.itqan_records_poll(text), public.itqan_records_scanned(text, timestamptz),
  public.itqan_records_request_sync(), public.itqan_records_set_interval(int), public.itqan_records_config() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 064: مزامنة سجلات المتابعة كل دقيقة وعند الطلب' as result;
