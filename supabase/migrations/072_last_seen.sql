-- =====================================================================
-- منصة إتقان: 072 — آخر تسجيل دخول وآخر ظهور لكل مستخدم
--  - آخر دخول وعدد مرات الدخول: يُسجَّلان تلقائياً عند إنشاء جلسة دخول (مشغّل على itqan.sessions)،
--    بلا أي تغيير في دالة الدخول نفسها.
--  - آخر ظهور: الجلسة تبقى أياماً فلا يتكرر الدخول، فيرسل الموقع «حضوراً» خفيفاً عند فتحه،
--    ولا يُكتب في قاعدة البيانات أكثر من مرة كل 15 دقيقة لكل مستخدم (لا ضغط يُذكر).
--  - العرض للموظفين فقط، وفي فرعهم فقط.
--
-- يتطلب 003 و009. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists itqan.user_presence (
  user_id      text primary key,
  last_login   timestamptz,
  login_count  integer not null default 0,
  last_seen    timestamptz
);
alter table itqan.user_presence enable row level security;
revoke all on itqan.user_presence from public, anon, authenticated;

-- كل جلسة دخول جديدة = تسجيل دخول
create or replace function itqan.presence_on_login()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into itqan.user_presence as p (user_id, last_login, login_count, last_seen)
  values (new.user_id, now(), 1, now())
  on conflict (user_id) do update set last_login = now(), login_count = p.login_count + 1, last_seen = now();
  return new;
end $$;

drop trigger if exists itqan_sessions_presence on itqan.sessions;
create trigger itqan_sessions_presence after insert on itqan.sessions
  for each row execute function itqan.presence_on_login();

-- «أنا هنا»: يُحدَّث آخر ظهور مرة كل 15 دقيقة على الأكثر
create or replace function public.itqan_touch()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid();
begin
  if v_uid is null then return; end if;
  insert into itqan.user_presence as p (user_id, last_seen) values (v_uid, now())
  on conflict (user_id) do update set last_seen = now()
  where p.last_seen is null or p.last_seen < now() - interval '15 minutes';
end $$;

-- للموظفين: {user_id: {l: آخر دخول, n: عدد مرات الدخول, s: آخر ظهور}}
create or replace function public.itqan_presence()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_branch text := itqan.my_branch();
begin
  if not coalesce(itqan.is_staff(), false) then return null; end if;
  return coalesce((
    select jsonb_object_agg(p.user_id, jsonb_build_object('l', p.last_login, 'n', p.login_count, 's', p.last_seen))
    from itqan.user_presence p
    where v_branch is null or itqan.user_branch(p.user_id) = v_branch), '{}'::jsonb);
end $$;

revoke all on function public.itqan_touch() from public;
revoke all on function public.itqan_presence() from public;
grant execute on function public.itqan_touch() to anon, authenticated;
grant execute on function public.itqan_presence() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 072: آخر تسجيل دخول وآخر ظهور' as result;
