-- =====================================================================
-- منصة إتقان: 038 — لوحة صاحب المنصة والاشتراك
--  يُشغَّل على قاعدة بيانات كل مدرسة.
--  - مفتاح صاحب المنصة (مُشفَّر): يُضبط مرة واحدة من SQL أو من workflow الإعداد:
--      select itqan.set_owner_key('مفتاح-طويل-عشوائي');
--    (الدالة غير متاحة للموقع؛ لا يضبطها مدير المدرسة)
--  - إحصاءات المدرسة لصاحب المنصة (بالمفتاح): المستخدمون، النشاط، المساحة، الاشتراك.
--  - الاشتراك: الخطة، تاريخ الانتهاء، حد الطلاب، وإيقاف المنصة عند الانتهاء (اختياري).
--    بلا اشتراك محدد = بلا قيود (مثل المدرسة المجانية).
--  - سجل المدارس (على نسخة صاحب المنصة): الاسم، الرابط، المفتاح العام (anon) لكل مدرسة.
--
-- يتطلب 003 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists itqan.owner_config (
  id        int primary key default 1 check (id = 1),
  key_hash  text,
  -- {"plan","expires_at","max_students","block_on_expiry","note"}
  license   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into itqan.owner_config (id) values (1) on conflict do nothing;
alter table itqan.owner_config enable row level security;
revoke all on itqan.owner_config from public, anon, authenticated;

create table if not exists itqan.owner_schools (
  id         text primary key default ('sch-' || encode(extensions.gen_random_bytes(5), 'hex')),
  name       text not null,
  url        text not null,
  anon_key   text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);
alter table itqan.owner_schools enable row level security;
revoke all on itqan.owner_schools from public, anon, authenticated;

-- ضبط المفتاح (لصاحب قاعدة البيانات فقط)
create or replace function itqan.set_owner_key(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(coalesce(p_key, '')) < 16 then raise exception 'key_too_short'; end if;
  update itqan.owner_config set key_hash = extensions.crypt(p_key, extensions.gen_salt('bf', 10)), updated_at = now() where id = 1;
end $$;
revoke all on function itqan.set_owner_key(text) from public, anon, authenticated;

create or replace function itqan.owner_ok(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.key_hash is not null and c.key_hash = extensions.crypt(coalesce(p_key, ''), c.key_hash)
                     from itqan.owner_config c where c.id = 1), false);
$$;
revoke all on function itqan.owner_ok(text) from public, anon, authenticated;

-- إحصاءات المدرسة لصاحب المنصة
create or replace function public.itqan_owner_stats(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not itqan.owner_ok(p_key) then perform pg_catalog.pg_sleep(1); raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'school_name', (select value #>> '{}' from public.app_settings where key = 'school_name'),
    'users', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (select role::text as role, count(*) as n from public.users group by role) x),
    'classes', (select count(*) from public.classes),
    'quizzes', (select count(*) from public.quizzes where coalesce(is_deleted, false) = false),
    'submissions', (select count(*) from public.submissions),
    'submissions_30d', (select count(*) from public.submissions where completed_at > now() - interval '30 days'),
    'active_users_7d', (select count(distinct user_id) from itqan.sessions where created_at > now() - interval '7 days'),
    'last_activity', greatest((select max(created_at) from itqan.sessions), (select max(completed_at) from public.submissions)),
    'db_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'license', (select license from itqan.owner_config where id = 1),
    'checked_at', now());
end $$;

create or replace function public.itqan_owner_set_license(p_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not itqan.owner_ok(p_key) then perform pg_catalog.pg_sleep(1); raise exception 'forbidden'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'bad_license'; end if;
  v := jsonb_strip_nulls(jsonb_build_object(
    'plan', nullif(p ->> 'plan', ''),
    'expires_at', case when coalesce(p ->> 'expires_at', '') ~ '^\d{4}-\d{2}-\d{2}$' then p ->> 'expires_at' end,
    'max_students', case when coalesce(p ->> 'max_students', '') ~ '^\d+$' then (p ->> 'max_students')::int end,
    'block_on_expiry', coalesce((p ->> 'block_on_expiry')::boolean, false),
    'note', nullif(left(coalesce(p ->> 'note', ''), 500), '')));
  update itqan.owner_config set license = v, updated_at = now() where id = 1;
  return v;
end $$;

-- الاشتراك كما يراه الموقع (للتنبيه/الإيقاف) — بلا ملاحظات صاحب المنصة
create or replace function public.itqan_license()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when c.license ? 'expires_at' or c.license ? 'plan' then
    (c.license - 'note') || jsonb_build_object(
      'days_left', case when c.license ? 'expires_at' then ((c.license ->> 'expires_at')::date - current_date) end,
      'students', (select count(*) from public.users where role::text = 'student'))
  else '{}'::jsonb end
  from itqan.owner_config c where c.id = 1;
$$;

-- سجل المدارس (على نسخة صاحب المنصة)
create or replace function public.itqan_owner_schools(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not itqan.owner_ok(p_key) then perform pg_catalog.pg_sleep(1); raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from itqan.owner_schools s), '[]'::jsonb);
end $$;

create or replace function public.itqan_owner_school_save(p_key text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v itqan.owner_schools;
begin
  if not itqan.owner_ok(p_key) then perform pg_catalog.pg_sleep(1); raise exception 'forbidden'; end if;
  if coalesce(p ->> 'name', '') = '' or coalesce(p ->> 'url', '') !~ '^https://' then raise exception 'bad_school'; end if;
  if coalesce(p ->> 'id', '') <> '' then
    update itqan.owner_schools set name = p ->> 'name', url = rtrim(p ->> 'url', '/'), anon_key = coalesce(p ->> 'anon_key', ''), notes = coalesce(p ->> 'notes', '')
     where id = p ->> 'id' returning * into v;
  else
    insert into itqan.owner_schools (name, url, anon_key, notes)
    values (p ->> 'name', rtrim(p ->> 'url', '/'), coalesce(p ->> 'anon_key', ''), coalesce(p ->> 'notes', '')) returning * into v;
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.itqan_owner_school_delete(p_key text, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.owner_ok(p_key) then perform pg_catalog.pg_sleep(1); raise exception 'forbidden'; end if;
  delete from itqan.owner_schools where id = p_id;
end $$;

revoke all on function public.itqan_owner_stats(text), public.itqan_owner_set_license(text, jsonb), public.itqan_license(),
  public.itqan_owner_schools(text), public.itqan_owner_school_save(text, jsonb), public.itqan_owner_school_delete(text, text) from public;
grant execute on function public.itqan_owner_stats(text), public.itqan_owner_set_license(text, jsonb), public.itqan_license(),
  public.itqan_owner_schools(text), public.itqan_owner_school_save(text, jsonb), public.itqan_owner_school_delete(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 038: لوحة صاحب المنصة والاشتراك' as result;
