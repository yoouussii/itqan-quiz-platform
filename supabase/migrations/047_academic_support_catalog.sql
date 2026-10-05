-- =====================================================================
-- منصة إتقان: 047 — مواد وفصول خاصة بالدعم الأكاديمي
--  - مواد الدعم وفصول (مجموعات) الدعم منفصلة عن مواد المدرسة وفصولها، ولا تظهر خارج الدعم.
--  - إنشاؤها وتعديلها وحذفها: المدير، أو من لديه صلاحية can_manage_acs_catalog.
--  - قراءتها لأي مستخدم مسجّل (أسماء فقط، يحتاجها الطالب وولي الأمر لعرض بطاقة الدعم).
--  - سجل الدعم يرتبط اختيارياً بمادة دعم وفصل دعم.
--
-- يتطلب 042 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.acs_subjects (
  id          text primary key default ('acsub-' || encode(extensions.gen_random_bytes(5), 'hex')),
  name        text not null check (length(trim(name)) between 1 and 80),
  created_by  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists acs_subjects_name_uq on public.acs_subjects (lower(trim(name)));

create table if not exists public.acs_classes (
  id          text primary key default ('acscl-' || encode(extensions.gen_random_bytes(5), 'hex')),
  name        text not null check (length(trim(name)) between 1 and 80),
  subject_id  text references public.acs_subjects (id) on delete set null,
  teacher_id  text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists acs_classes_name_uq on public.acs_classes (lower(trim(name)));

alter table public.academic_support add column if not exists acs_subject_id text references public.acs_subjects (id) on delete set null;
alter table public.academic_support add column if not exists acs_class_id text references public.acs_classes (id) on delete set null;
create index if not exists acs_class_idx on public.academic_support (acs_class_id);

create or replace function itqan.acs_catalog_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_admin() or itqan.has_perm('can_manage_acs_catalog');
$$;
grant execute on function itqan.acs_catalog_manager() to anon, authenticated;

alter table public.acs_subjects enable row level security;
alter table public.acs_classes enable row level security;
revoke all on public.acs_subjects, public.acs_classes from public, anon, authenticated;
grant select, insert, update, delete on public.acs_subjects, public.acs_classes to anon, authenticated;

drop policy if exists acsub_select on public.acs_subjects;
create policy acsub_select on public.acs_subjects for select to anon, authenticated using (itqan.uid() is not null);
drop policy if exists acsub_write on public.acs_subjects;
create policy acsub_write on public.acs_subjects for all to anon, authenticated
  using (itqan.acs_catalog_manager()) with check (itqan.acs_catalog_manager());

drop policy if exists acscl_select on public.acs_classes;
create policy acscl_select on public.acs_classes for select to anon, authenticated using (itqan.uid() is not null);
drop policy if exists acscl_write on public.acs_classes;
create policy acscl_write on public.acs_classes for all to anon, authenticated
  using (itqan.acs_catalog_manager()) with check (itqan.acs_catalog_manager());

-- إشعار الانضمام: اسم مادة الدعم أولاً، ثم مادة المدرسة (للسجلات القديمة)
create or replace function itqan.acs_notify_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; v_subject text; v_class text;
begin
  select u.name into v_name from public.users u where u.id::text = new.student_id;
  select s.name into v_subject from public.acs_subjects s where s.id = new.acs_subject_id;
  if v_subject is null then select s.name into v_subject from public.subjects s where s.id::text = new.subject_id; end if;
  select c.name into v_class from public.acs_classes c where c.id = new.acs_class_id;
  perform itqan.acs_notify(new.student_id, 'الدعم الأكاديمي',
    'انضم ' || coalesce(v_name, 'الطالب') || ' لبرنامج الدعم الأكاديمي' || coalesce(' في ' || v_subject, '') || coalesce(' (' || v_class || ')', '')
      || ' مع ' || coalesce(nullif(new.teacher_name, ''), 'المعلم') || '. مستواه عند الاستلام ' || new.start_level || '%، والهدف ' || new.target_level || '%.',
    new.id, new.teacher_id, new.teacher_name);
  return null;
end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 047: مواد وفصول الدعم الأكاديمي' as result;
