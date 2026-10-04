-- =====================================================================
-- منصة إتقان: 039 — قفل حقيقي عند انتهاء الاشتراك
--  عند انتهاء الاشتراك مع تفعيل «إيقاف المنصة عند الانتهاء» (038):
--   - يُرفض تسجيل دخول غير مدير النظام على الخادم.
--   - جلسات غير المديرين المفتوحة تتوقف فوراً: itqan.uid() لا يتعرّف عليهم،
--     فتمنعهم سياسات الحماية (RLS) من قراءة أي بيانات أو تعديلها، ولو بطلبات مباشرة.
--   - مدير النظام يبقى قادراً على الدخول والتصدير.
--  بلا اشتراك محدد، أو بدون خيار الإيقاف: لا شيء يتغير.
--
-- يتطلب 003 و038 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.license_blocked()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select coalesce((c.license ->> 'block_on_expiry')::boolean, false)
       and (c.license ->> 'expires_at') is not null
       and (c.license ->> 'expires_at')::date < current_date
      from itqan.owner_config c where c.id = 1), false);
$$;
grant execute on function itqan.license_blocked() to anon, authenticated;

-- نفس تعريف 003 مع شرط الاشتراك: غير المدير لا يُعرَّف أثناء الإيقاف
create or replace function itqan.uid()
returns text language sql stable security definer set search_path = '' as $$
  select s.user_id
  from itqan.sessions s
  where s.token_hash = itqan.hash_token(itqan.request_token())
    and s.expires_at > now()
    and (not itqan.license_blocked()
         or exists (select 1 from public.users u where u.id::text = s.user_id and u.role::text = 'admin'))
  limit 1;
$$;

-- رفض إنشاء جلسة لغير المدير أثناء الإيقاف (مثل وضع الصيانة 019)
create or replace function itqan.sessions_license_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if itqan.license_blocked()
     and coalesce((select u.role::text from public.users u where u.id::text = new.user_id), '') <> 'admin' then
    raise exception 'license_expired' using hint = 'انتهى اشتراك المدرسة';
  end if;
  return new;
end $$;
drop trigger if exists itqan_sessions_license on itqan.sessions;
create trigger itqan_sessions_license before insert on itqan.sessions
  for each row execute function itqan.sessions_license_trigger();

-- عند ضبط اشتراك منتهٍ مع الإيقاف: إنهاء جلسات غير المديرين فوراً
create or replace function itqan.owner_license_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if itqan.license_blocked() then
    delete from itqan.sessions s
     where not exists (select 1 from public.users u where u.id::text = s.user_id and u.role::text = 'admin');
  end if;
  return null;
end $$;
drop trigger if exists itqan_owner_license on itqan.owner_config;
create trigger itqan_owner_license after update of license on itqan.owner_config
  for each row execute function itqan.owner_license_trigger();

notify pgrst, 'reload schema';

select '✓ تم تحديث 039: قفل حقيقي عند انتهاء الاشتراك' as result;
