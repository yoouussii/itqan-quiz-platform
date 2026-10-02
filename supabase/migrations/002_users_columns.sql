-- =====================================================================
-- منصة إتقان: إصلاح حفظ بيانات المشرف والمعلم في جدول users
--
-- السبب: إذا كان أحد هذه الأعمدة غير موجود، أو كان الجدول يقبل الأدوار
-- admin/teacher/student فقط، يرفض الخادم الحفظ فيبقى التعديل على جهاز المدير وحده.
-- التشغيل: Supabase Dashboard ← SQL Editor ← الصق الملف ← Run (آمن لإعادة التشغيل)
-- =====================================================================

alter table public.users add column if not exists username             text;
alter table public.users add column if not exists email                text;
alter table public.users add column if not exists job_title            text;
alter table public.users add column if not exists specialty_id         text;
alter table public.users add column if not exists class_id             text;
alter table public.users add column if not exists assigned_subject_ids jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists assigned_class_ids   jsonb not null default '[]'::jsonb;
alter table public.users add column if not exists permissions          jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists teacher_permissions  jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists created_by           text;
alter table public.users add column if not exists created_at           timestamptz not null default now();
alter table public.users add column if not exists updated_at           timestamptz not null default now();

-- السماح بدور المشرف: حذف أي قيد قديم على عمود role ثم إضافة قيد يشمل supervisor
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'users' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.users drop constraint %I', c.conname);
  end loop;
end $$;

-- إن كان role من نوع enum نضيف له القيمة supervisor
do $$
declare t regtype;
begin
  select atttypid::regtype into t from pg_attribute
  where attrelid = 'public.users'::regclass and attname = 'role';
  if exists (select 1 from pg_type where oid = t::oid and typtype = 'e') then
    execute format('alter type %s add value if not exists %L', t, 'supervisor');
  else
    alter table public.users
      add constraint users_role_check check (role in ('admin', 'teacher', 'student', 'supervisor'));
  end if;
end $$;

-- تحديث ذاكرة PostgREST حتى ترى الأعمدة الجديدة فوراً
notify pgrst, 'reload schema';
