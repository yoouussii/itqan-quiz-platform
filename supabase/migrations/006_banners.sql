-- =====================================================================
-- منصة إتقان: 006 — بانرات الصفحة الرئيسية (صورة عريضة أو معرض صور مع نص)
--
-- يتطلب 003 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
--  - يعرضها كل مستخدم مسجّل دخوله (الموقع يختار حسب الفئة: الجميع/الطلاب/الطاقم).
--  - يضيفها ويعدّلها ويحذفها مدير النظام فقط.
-- =====================================================================

create table if not exists public.banners (
  id          text primary key,
  kind        text not null default 'wide' check (kind in ('wide', 'gallery')),
  title       text not null default '',
  body        text not null default '',
  -- [{ "src": "data:image/jpeg;base64,...", "caption": "اسم الطالب" }]
  images      jsonb not null default '[]'::jsonb,
  audience    text not null default 'all' check (audience in ('all', 'students', 'staff')),
  theme       text not null default 'indigo',
  text_position text not null default 'overlay' check (text_position in ('overlay', 'below')),
  is_active   boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  sort        integer not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists banners_active_idx on public.banners (is_active, sort);

alter table public.banners enable row level security;
drop policy if exists banners_select on public.banners;
create policy banners_select on public.banners for select to anon, authenticated
  using ((select itqan.uid()) is not null);
drop policy if exists banners_admin on public.banners;
create policy banners_admin on public.banners for all to anon, authenticated
  using ((select itqan.is_admin())) with check ((select itqan.is_admin()));

notify pgrst, 'reload schema';

select '✓ تم تحديث 006' as result;
