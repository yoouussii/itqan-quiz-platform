-- =====================================================================
-- منصة إتقان: جداول مزايا الإصدار v8
-- (الإشعارات، سجل النشاط، الجوائز، إعدادات النظام، الصور الرمزية)
--
-- بدون هذه الجداول تعمل المزايا على الجهاز المحلي فقط ولا تصل لبقية المستخدمين.
-- التشغيل: Supabase Dashboard ← SQL Editor ← الصق الملف كاملاً ← Run
-- الملف آمن لإعادة التشغيل (IF NOT EXISTS).
-- =====================================================================

-- الإشعارات: صف لكل إشعار مع وصف الجمهور المستهدف (audience)
create table if not exists public.notifications (
  id               text primary key,
  type             text not null,
  title            text not null,
  body             text not null default '',
  audience         jsonb not null default '{}'::jsonb,
  ref_type         text,
  ref_id           text,
  created_by       text,
  created_by_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);

-- حالة "مقروء" لكل مستخدم
create table if not exists public.notification_reads (
  user_id          text not null,
  notification_id  text not null,
  read_at          timestamptz not null default now(),
  primary key (user_id, notification_id)
);

-- سجل النشاط
create table if not exists public.activity_log (
  id           text primary key,
  actor_id     text,
  actor_name   text,
  actor_role   text,
  action       text not null,
  target_type  text,
  target_id    text,
  target_name  text,
  details      text,
  created_at   timestamptz not null default now()
);
create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);

-- جوائز الطلاب
create table if not exists public.student_awards (
  id               text primary key,
  student_id       text not null,
  student_name     text,
  class_name       text,
  title            text not null,
  note             text,
  points           integer not null default 0,
  awarded_by       text,
  awarded_by_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists student_awards_student_idx on public.student_awards (student_id);

-- إعدادات النظام (مفتاح ← قيمة)
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

-- الصور الرمزية (صورة مصغّرة data:image/... أو preset:اسم)
create table if not exists public.user_avatars (
  user_id     text primary key,
  data        text not null,
  updated_at  timestamptz not null default now()
);

-- المسمى الوظيفي في جدول المستخدمين
alter table if exists public.users add column if not exists job_title text;

-- ---------------------------------------------------------------------
-- الصلاحيات: التطبيق يتصل بمفتاح anon مباشرة (مثل بقية الجداول الحالية)،
-- لذلك نفعّل RLS مع سياسة تسمح للتطبيق بالقراءة والكتابة.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['notifications','notification_reads','activity_log','student_awards','app_settings','user_avatars']
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'itqan_app_access'
    ) then
      execute format(
        'create policy itqan_app_access on public.%I for all to anon, authenticated using (true) with check (true)', t
      );
    end if;
  end loop;
end $$;
