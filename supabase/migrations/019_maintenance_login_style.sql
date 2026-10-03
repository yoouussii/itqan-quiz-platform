-- =====================================================================
-- منصة إتقان: 019 — وضع الصيانة وتصميم شاشة الدخول
--  - وضع الصيانة (من الإعدادات): لا يدخل إلا مدير النظام. باقي المستخدمين يرون صفحة «الموقع تحت الصيانة».
--    * يُطبَّق على الخادم: تسجيل دخول غير المدير يُرفض أثناء الصيانة.
--    * عند تفعيل الصيانة تُنهى جلسات غير المديرين فوراً (يُعاد توجيههم لصفحة الصيانة).
--  - تصميم شاشة الدخول (login_style) وصورة/شعارات الدخول تُقرأ قبل تسجيل الدخول (عامة).
--
-- يتطلب 003 و012 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.maintenance_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value ->> 'on')::boolean from public.app_settings s where s.key = 'maintenance'), false);
$$;

-- رفض تسجيل دخول غير المدير أثناء الصيانة (الجلسة تُنشأ عند كل دخول ناجح)
create or replace function itqan.sessions_maintenance_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if itqan.maintenance_on()
     and coalesce((select u.role from public.users u where u.id::text = new.user_id), '') <> 'admin' then
    raise exception 'maintenance' using hint = 'الموقع تحت الصيانة';
  end if;
  return new;
end $$;

drop trigger if exists itqan_sessions_maintenance on itqan.sessions;
create trigger itqan_sessions_maintenance before insert on itqan.sessions
  for each row execute function itqan.sessions_maintenance_trigger();

-- عند تفعيل الصيانة: إنهاء جلسات كل من ليس مديراً
create or replace function itqan.settings_maintenance_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.key = 'maintenance' and coalesce((new.value ->> 'on')::boolean, false) then
    delete from itqan.sessions s
    where not exists (select 1 from public.users u where u.id::text = s.user_id and u.role = 'admin');
  end if;
  return new;
end $$;

drop trigger if exists itqan_settings_maintenance on public.app_settings;
create trigger itqan_settings_maintenance after insert or update on public.app_settings
  for each row execute function itqan.settings_maintenance_trigger();

-- هوية شاشة الدخول (عامة قبل تسجيل الدخول): أُضيف وضع الصيانة وتصميم الشاشة وصورتها والشعاران
create or replace function public.itqan_public_branding()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
  from public.app_settings s
  where s.key in ('school_name', 'school_logo', 'brand_color', 'maintenance', 'login_style', 'login_image', 'login_tagline', 'cert_company_logo', 'cert_school_logo');
$$;

revoke all on function public.itqan_public_branding() from public;
grant execute on function public.itqan_public_branding() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 019: وضع الصيانة وتصميم شاشة الدخول' as result;
