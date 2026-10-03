-- =====================================================================
-- منصة إتقان: 013 — خيارات البانر: «دائم» (بدون زر إخفاء) وتأثيرات احتفالية
--
-- يتطلب 006 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

alter table public.banners add column if not exists pinned boolean not null default false;
alter table public.banners add column if not exists effect text not null default 'none';

notify pgrst, 'reload schema';

select '✓ تم تحديث 013: خيارات البانر (دائم + تأثيرات)' as result;
