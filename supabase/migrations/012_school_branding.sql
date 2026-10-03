-- =====================================================================
-- منصة إتقان: 012 — هوية المدرسة في شاشة الدخول
--
-- يتطلب 003 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- اسم المدرسة وشعارها ولونها محفوظة في app_settings (يعدّلها مدير النظام من الإعدادات).
-- الجدول لا يُقرأ بدون تسجيل دخول، فهذه الدالة تُرجع هذه المفاتيح الثلاثة فقط لشاشة الدخول،
-- ولا تكشف باقي الإعدادات.
-- =====================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

create or replace function public.itqan_public_branding()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
  from public.app_settings s
  where s.key in ('school_name', 'school_logo', 'brand_color');
$$;

revoke all on function public.itqan_public_branding() from public;
grant execute on function public.itqan_public_branding() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 012: هوية المدرسة في شاشة الدخول' as result;
