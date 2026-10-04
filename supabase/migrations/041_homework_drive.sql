-- =====================================================================
-- منصة إتقان: 041 — مرفقات الواجبات على Google Drive (اختياري)
--  عند التفعيل (سير العمل «Setup Drive storage») تُرفع الملفات إلى مجلد في Google Drive
--  عبر دالة homework-drive، ويبقى في قاعدة البيانات اسم الملف ورقمه في Drive فقط.
--  بدون تفعيل: تبقى الملفات في قاعدة البيانات كما في 040.
--  - الصلاحيات كما هي (RLS على homework_files): الدالة تُنشئ صف الملف بجلسة المستخدم نفسه.
--  - رقم ملف Drive لا يكتبه إلا الخادم (حتى لا يشير مستخدم إلى ملف غيره).
--  - حذف الملف أو الواجب يضع ملف Drive في قائمة حذف تنفذها الدالة لاحقاً.
--
-- يتطلب 040 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.homework_files add column if not exists storage text not null default 'db';
alter table public.homework_files add column if not exists drive_id text;
do $$ begin
  alter table public.homework_files add constraint hwf_storage_chk check (storage in ('db', 'drive'));
exception when duplicate_object then null; end $$;

-- إعداد التخزين (يضبطه سير العمل)
create table if not exists itqan.storage_config (
  id         int primary key default 1 check (id = 1),
  mode       text not null default 'db' check (mode in ('db', 'drive')),
  updated_at timestamptz not null default now()
);
insert into itqan.storage_config (id) values (1) on conflict do nothing;
alter table itqan.storage_config add column if not exists last_error text;
alter table itqan.storage_config add column if not exists last_error_at timestamptz;
alter table itqan.storage_config enable row level security;
revoke all on itqan.storage_config from public, anon, authenticated;

-- ملفات Drive المنتظرة للحذف
create table if not exists itqan.drive_trash (
  drive_id   text primary key,
  created_at timestamptz not null default now()
);
alter table itqan.drive_trash enable row level security;
revoke all on itqan.drive_trash from public, anon, authenticated;

create or replace function public.itqan_storage_mode()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select mode from itqan.storage_config where id = 1), 'db');
$$;
revoke all on function public.itqan_storage_mode() from public;
grant execute on function public.itqan_storage_mode() to anon, authenticated;

-- هل الطلب من الخادم (مفتاح service_role)؟
create or replace function itqan.is_service()
returns boolean language sql stable set search_path = '' as $$
  -- طلبات الموقع تمر عبر PostgREST بدور في المفتاح؛ الاتصال المباشر (سير العمل) بلا مفتاح
  select case when coalesce(current_setting('request.jwt.claims', true), '') = ''
              then session_user in ('postgres', 'supabase_admin')
              else coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role' end;
$$;

-- حارس الملفات: الحجم من المحتوى لملفات القاعدة، ومن الخادم لملفات Drive
create or replace function itqan.hwf_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- لا يغيّر أحدٌ الملف بعد رفعه إلا الخادم (لتسجيل رقمه في Drive)
    if not itqan.is_service() then raise exception 'forbidden'; end if;
    return new;
  end if;
  if new.drive_id is not null and not itqan.is_service() then raise exception 'forbidden'; end if;
  if new.storage = 'drive' then
    if new.data <> '' then raise exception 'bad_file'; end if;
    new.size := greatest(0, least(coalesce(new.size, 0), 50 * 1024 * 1024));
  else
    new.size := (octet_length(new.data) * 3) / 4;
  end if;
  if new.submission_id is not null and (select count(*) from public.homework_files f where f.submission_id = new.submission_id) >= 5 then
    raise exception 'too_many_files';
  end if;
  if new.homework_id is not null and (select count(*) from public.homework_files f where f.homework_id = new.homework_id) >= 10 then
    raise exception 'too_many_files';
  end if;
  return new;
end $$;
drop trigger if exists hwf_guard on public.homework_files;
create trigger hwf_guard before insert or update on public.homework_files
  for each row execute function itqan.hwf_guard_trigger();

-- حذف صف ملف Drive (مباشرة أو مع الواجب/التسليم) ← قائمة الحذف
create or replace function itqan.hwf_drive_trash_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.drive_id is not null then
    insert into itqan.drive_trash (drive_id) values (old.drive_id) on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists hwf_drive_trash on public.homework_files;
create trigger hwf_drive_trash after delete on public.homework_files
  for each row execute function itqan.hwf_drive_trash_trigger();

-- قائمة الحذف للدالة فقط (مفتاح الخادم)
create or replace function public.itqan_drive_trash_take(p_limit int default 20)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if not itqan.is_service() then raise exception 'forbidden'; end if;
  with x as (select drive_id from itqan.drive_trash order by created_at limit greatest(1, least(p_limit, 100))),
       d as (delete from itqan.drive_trash t using x where t.drive_id = x.drive_id returning t.drive_id)
  select coalesce(array_agg(drive_id), '{}') into v from d;
  return v;
end $$;

create or replace function public.itqan_drive_trash_put(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.is_service() then raise exception 'forbidden'; end if;
  insert into itqan.drive_trash (drive_id) values (p_id) on conflict do nothing;
end $$;
revoke all on function public.itqan_drive_trash_take(int), public.itqan_drive_trash_put(text) from public, anon, authenticated;
grant execute on function public.itqan_drive_trash_take(int), public.itqan_drive_trash_put(text) to service_role;

-- الدالة تسجّل آخر خطأ في Drive (مثل انتهاء الإذن) ليظهر تنبيه للمدير؛ null = عاد يعمل
create or replace function public.itqan_storage_report(p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.is_service() then raise exception 'forbidden'; end if;
  update itqan.storage_config set last_error = left(p_error, 300), last_error_at = case when p_error is null then null else now() end where id = 1;
end $$;
revoke all on function public.itqan_storage_report(text) from public, anon, authenticated;
grant execute on function public.itqan_storage_report(text) to service_role;

-- المساحة: ملفات القاعدة وملفات Drive منفصلة
create or replace function public.itqan_homework_storage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not itqan.is_staff() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'homework', (select count(*) from public.homework),
    'files', (select count(*) from public.homework_files where storage = 'db'),
    'bytes', (select coalesce(sum(size), 0) from public.homework_files where storage = 'db'),
    'drive_files', (select count(*) from public.homework_files where storage = 'drive'),
    'drive_bytes', (select coalesce(sum(size), 0) from public.homework_files where storage = 'drive'),
    'mode', (select mode from itqan.storage_config where id = 1),
    'drive_error', (select last_error from itqan.storage_config where id = 1 and last_error_at > now() - interval '3 days'),
    'oldest', (select min(created_at) from public.homework));
end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 041: مرفقات الواجبات على Google Drive (اختياري)' as result;
