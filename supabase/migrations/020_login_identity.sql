-- =====================================================================
-- منصة إتقان: 020 — اسم المدرسة وشعاراها في شاشة الدخول، ومدة عرض كل بانر
--  - يكتب المدير اسماً وشعارين خاصين بشاشة الدخول وصفحة الصيانة (مفيد للفروع المشتقة)،
--    دون تغيير اسم المدرسة في الشهادات أو أعلى الصفحات.
--  - تُقرأ قبل تسجيل الدخول من دالة الهوية العامة.
--
-- يتطلب 019 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

-- مدة عرض كل بانر بالثواني (فارغة = المدة العامة من إعدادات البانرات)
alter table public.banners add column if not exists duration_seconds integer
  check (duration_seconds is null or duration_seconds between 2 and 120);

create or replace function public.itqan_public_branding()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
  from public.app_settings s
  where s.key in ('school_name', 'school_logo', 'brand_color', 'maintenance', 'login_style', 'login_image', 'login_tagline',
                  'login_title', 'login_logo', 'login_logo2', 'cert_school_name', 'cert_company_logo', 'cert_school_logo');
$$;

revoke all on function public.itqan_public_branding() from public;
grant execute on function public.itqan_public_branding() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 020: اسم المدرسة وشعاراها في شاشة الدخول' as result;
