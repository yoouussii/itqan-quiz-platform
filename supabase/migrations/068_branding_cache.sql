-- =====================================================================
-- منصة إتقان: 068 — هوية المدرسة بلا إعادة تنزيل الشعار
--  - الشعارات محفوظة كصور داخل الإعدادات (عشرات الكيلوبايتات لكل صورة)، وكانت
--    تُنزَّل مع كل تحديث دوري لكل مستخدم. الدالة الجديدة تستقبل بصمة (md5) ما لدى
--    الجهاز وترجع فقط القيم التي تغيّرت، مع بصمات كل القيم.
--  - نفس المفاتيح العامة في itqan_public_branding (012/019/020) ولا يُكشف غيرها.
--
-- آمن لإعادة التشغيل. المنصة تعمل بدونه (ترجع للدالة القديمة).
-- =====================================================================

create or replace function public.itqan_public_branding_v2(p_have jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'values', coalesce(jsonb_object_agg(s.key, s.value) filter (where coalesce(p_have ->> s.key, '') <> md5(s.value::text)), '{}'::jsonb),
    'hashes', coalesce(jsonb_object_agg(s.key, md5(s.value::text)), '{}'::jsonb)
  )
  from public.app_settings s
  where s.key in ('school_name', 'school_logo', 'brand_color', 'maintenance', 'login_style', 'login_image', 'login_tagline',
                  'login_title', 'login_logo', 'login_logo2', 'cert_school_name', 'cert_company_logo', 'cert_school_logo');
$$;

revoke all on function public.itqan_public_branding_v2(jsonb) from public;
grant execute on function public.itqan_public_branding_v2(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 068: هوية المدرسة بلا إعادة تنزيل الشعار' as result;
