-- =====================================================================
-- منصة إتقان: 042 — الدعم الأكاديمي + ملاحظات الحضور
--  الدعم الأكاديمي (صلاحية can_academic_support):
--   - معلم الدعم يضيف الطلاب المحتاجين: مستوى الاستلام (%)، الهدف، المادة، خطة الدعم.
--   - يسجل قياسات دورية للمستوى بملاحظة، فيتحدث «المستوى الحالي».
--   - الطالب وولي أمره يريان: استلمه المعلم بمستوى كذا، ومستواه الآن كذا.
--   - المدير يرى الكل، والمشرف صاحب الصلاحية يرى الكل، والمعلم يرى طلابه.
--  ملاحظات الحضور (صلاحية can_note_attendance أو إدارة الحضور):
--   - ملاحظة على غياب/تأخر/استئذان يوم معيّن، تبقى بعد كل مزامنة لسجل الغياب.
--   - اختيارياً تظهر لولي الأمر.
--
-- يتطلب 003 و009 و022 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.academic_support (
  id           text primary key default ('as-' || encode(extensions.gen_random_bytes(6), 'hex')),
  student_id   text not null,
  teacher_id   text not null,
  teacher_name text not null default '',
  subject_id   text,
  start_level  int not null check (start_level between 0 and 100),
  target_level int not null default 80 check (target_level between 1 and 100),
  current_level int not null check (current_level between 0 and 100),
  plan         text not null default '' check (length(plan) <= 3000),
  status       text not null default 'active' check (status in ('active', 'done', 'stopped')),
  started_at   date not null default current_date,
  closed_at    date,
  created_at   timestamptz not null default now()
);
create index if not exists acs_student_idx on public.academic_support (student_id);
create index if not exists acs_teacher_idx on public.academic_support (teacher_id);

create table if not exists public.academic_support_progress (
  id          bigserial primary key,
  support_id  text not null references public.academic_support (id) on delete cascade,
  -- قياس (بمستوى) أو ملاحظة/تقييم يومي (بلا مستوى)
  level       int check (level between 0 and 100),
  rating      text check (rating in ('excellent', 'very_good', 'good', 'needs_follow')),
  note        text not null default '' check (length(note) <= 1000),
  at          date not null default current_date,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists acsp_support_idx on public.academic_support_progress (support_id, at);
alter table public.academic_support_progress alter column level drop not null;
alter table public.academic_support_progress add column if not exists rating text;
do $$ begin
  alter table public.academic_support_progress add constraint acsp_rating_chk check (rating in ('excellent', 'very_good', 'good', 'needs_follow'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.academic_support_progress add constraint acsp_content_chk check (level is not null or rating is not null or note <> '');
exception when duplicate_object then null; end $$;

-- من يرى سجل الدعم؟
create or replace function itqan.acs_visible(p_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.academic_support a
     where a.id = p_id
       and (a.student_id = itqan.uid() or a.student_id = any(itqan.my_children())
            or a.teacher_id = itqan.uid() or itqan.is_admin()
            or (itqan.my_role() = 'supervisor' and itqan.has_perm('can_academic_support'))));
$$;
create or replace function itqan.acs_owner(p_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_admin() or exists (select 1 from public.academic_support a where a.id = p_id and a.teacher_id = itqan.uid());
$$;
grant execute on function itqan.acs_visible(text), itqan.acs_owner(text) to anon, authenticated;

alter table public.academic_support enable row level security;
alter table public.academic_support_progress enable row level security;
revoke all on public.academic_support, public.academic_support_progress from public, anon, authenticated;
grant select, insert, update, delete on public.academic_support, public.academic_support_progress to anon, authenticated;
grant usage on sequence public.academic_support_progress_id_seq to anon, authenticated;

drop policy if exists acs_select on public.academic_support;
create policy acs_select on public.academic_support for select to anon, authenticated
  using (student_id = itqan.uid() or student_id = any(itqan.my_children()) or teacher_id = itqan.uid() or itqan.is_admin()
         or (itqan.my_role() = 'supervisor' and itqan.has_perm('can_academic_support')));
drop policy if exists acs_insert on public.academic_support;
create policy acs_insert on public.academic_support for insert to anon, authenticated
  with check (teacher_id = itqan.uid() and itqan.has_perm('can_academic_support')
              and exists (select 1 from public.users u where u.id::text = student_id and u.role::text = 'student'));
drop policy if exists acs_update on public.academic_support;
create policy acs_update on public.academic_support for update to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin()) with check (teacher_id = itqan.uid() or itqan.is_admin());
drop policy if exists acs_delete on public.academic_support;
create policy acs_delete on public.academic_support for delete to anon, authenticated using (teacher_id = itqan.uid() or itqan.is_admin());

drop policy if exists acsp_select on public.academic_support_progress;
create policy acsp_select on public.academic_support_progress for select to anon, authenticated using (itqan.acs_visible(support_id));
drop policy if exists acsp_insert on public.academic_support_progress;
create policy acsp_insert on public.academic_support_progress for insert to anon, authenticated
  with check (created_by = itqan.uid() and itqan.acs_owner(support_id));
drop policy if exists acsp_delete on public.academic_support_progress;
create policy acsp_delete on public.academic_support_progress for delete to anon, authenticated using (itqan.acs_owner(support_id));

-- حماية: مستوى الاستلام والمعلم والطالب ثابتة بعد الإنشاء؛ «الحالي» يتبع آخر قياس
create or replace function itqan.acs_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.current_level := new.start_level;
    new.status := 'active'; new.closed_at := null;
    return new;
  end if;
  new.student_id := old.student_id; new.teacher_id := old.teacher_id; new.start_level := old.start_level;
  new.started_at := old.started_at;
  -- المستوى الحالي لا يتغير إلا من القياسات (المشغّل أدناه يضع العلامة)
  if coalesce(current_setting('itqan.acs_sync', true), '') <> '1' then new.current_level := old.current_level; end if;
  if new.status <> 'active' and old.status = 'active' then new.closed_at := current_date; end if;
  if new.status = 'active' then new.closed_at := null; end if;
  return new;
end $$;
drop trigger if exists acs_guard on public.academic_support;
create trigger acs_guard before insert or update on public.academic_support
  for each row execute function itqan.acs_guard_trigger();

create or replace function itqan.acsp_after_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id text := coalesce(new.support_id, old.support_id); v_level int;
begin
  select p.level into v_level from public.academic_support_progress p where p.support_id = v_id and p.level is not null order by p.at desc, p.id desc limit 1;
  perform set_config('itqan.acs_sync', '1', true);
  update public.academic_support a set current_level = coalesce(v_level, a.start_level) where a.id = v_id;
  perform set_config('itqan.acs_sync', '', true);
  return null;
end $$;
drop trigger if exists acsp_after on public.academic_support_progress;
create trigger acsp_after after insert or delete on public.academic_support_progress
  for each row execute function itqan.acsp_after_trigger();

-- الإشعارات: انضمام لبرنامج الدعم، وكل قياس جديد (للطالب وولي أمره)
create or replace function itqan.acs_notify(p_student text, p_title text, p_body text, p_ref text, p_by text, p_by_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-acs-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement', p_title, p_body,
          jsonb_build_object('student_ids', jsonb_build_array(p_student),
            'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                         where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ? p_student)),
          'academic_support', p_ref, p_by, p_by_name);
exception when others then null;
end $$;

create or replace function itqan.acs_notify_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; v_subject text;
begin
  select u.name into v_name from public.users u where u.id::text = new.student_id;
  select s.name into v_subject from public.subjects s where s.id::text = new.subject_id;
  perform itqan.acs_notify(new.student_id, 'الدعم الأكاديمي',
    'انضم ' || coalesce(v_name, 'الطالب') || ' لبرنامج الدعم الأكاديمي' || coalesce(' في ' || v_subject, '')
      || ' مع ' || coalesce(nullif(new.teacher_name, ''), 'المعلم') || '. مستواه عند الاستلام ' || new.start_level || '%، والهدف ' || new.target_level || '%.',
    new.id, new.teacher_id, new.teacher_name);
  return null;
end $$;
drop trigger if exists acs_notify_after_insert on public.academic_support;
create trigger acs_notify_after_insert after insert on public.academic_support
  for each row execute function itqan.acs_notify_insert();

create or replace function itqan.acsp_notify_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.academic_support; v_name text;
begin
  select * into a from public.academic_support where id = new.support_id;
  select u.name into v_name from public.users u where u.id::text = a.student_id;
  perform itqan.acs_notify(a.student_id,
    case when new.level is not null then 'الدعم الأكاديمي: قياس جديد' else 'الدعم الأكاديمي: ملاحظة المعلم' end,
    coalesce(v_name, 'الطالب') || ': '
      || case when new.level is not null then 'المستوى الآن ' || new.level || '% (عند الاستلام ' || a.start_level || '%)' else '' end
      || case new.rating when 'excellent' then ' · التقييم: ممتاز' when 'very_good' then ' · التقييم: جيد جداً' when 'good' then ' · التقييم: جيد' when 'needs_follow' then ' · التقييم: يحتاج متابعة' else '' end
      || case when new.note <> '' then E'\n' || left(new.note, 300) else '' end,
    a.id, new.created_by, a.teacher_name);
  return null;
end $$;
drop trigger if exists acsp_notify_after_insert on public.academic_support_progress;
create trigger acsp_notify_after_insert after insert on public.academic_support_progress
  for each row execute function itqan.acsp_notify_insert();

-- =====================================================================
-- ملاحظات الحضور
-- =====================================================================
create table if not exists public.attendance_notes (
  id               bigserial primary key,
  student_id       text not null,
  day              date not null,
  kind             text not null check (kind in ('absent', 'late', 'excused')),
  note             text not null check (length(note) between 1 and 1000),
  visible_to_parent boolean not null default false,
  created_by       text not null,
  created_by_name  text not null default '',
  updated_at       timestamptz not null default now(),
  unique (student_id, day, kind)
);
create index if not exists attn_student_idx on public.attendance_notes (student_id);

alter table public.attendance_notes enable row level security;
revoke all on public.attendance_notes from public, anon, authenticated;
grant select, insert, update, delete on public.attendance_notes to anon, authenticated;
grant usage on sequence public.attendance_notes_id_seq to anon, authenticated;

create or replace function itqan.att_can_note(p_student text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.attendance_in_scope(p_student, 'can_note_attendance') or itqan.attendance_in_scope(p_student, 'can_manage_attendance');
$$;
grant execute on function itqan.att_can_note(text) to anon, authenticated;

drop policy if exists attn_select on public.attendance_notes;
create policy attn_select on public.attendance_notes for select to anon, authenticated
  using (itqan.att_can_note(student_id)
      or itqan.attendance_in_scope(student_id, 'can_view_attendance')
      or (visible_to_parent and (student_id = itqan.uid() or student_id = any(itqan.my_children()))));
drop policy if exists attn_insert on public.attendance_notes;
create policy attn_insert on public.attendance_notes for insert to anon, authenticated
  with check (created_by = itqan.uid() and itqan.att_can_note(student_id));
drop policy if exists attn_update on public.attendance_notes;
create policy attn_update on public.attendance_notes for update to anon, authenticated
  using (itqan.att_can_note(student_id)) with check (created_by = itqan.uid() and itqan.att_can_note(student_id));
drop policy if exists attn_delete on public.attendance_notes;
create policy attn_delete on public.attendance_notes for delete to anon, authenticated using (itqan.att_can_note(student_id));

create or replace function itqan.attn_touch_trigger()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists attn_touch on public.attendance_notes;
create trigger attn_touch before insert or update on public.attendance_notes
  for each row execute function itqan.attn_touch_trigger();

-- صاحب صلاحية الملاحظات يرى سجل الحضور أيضاً (ليكتب عليه)
drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records for select to anon, authenticated
  using (
    student_id = (select itqan.uid())
    or student_id = any(itqan.my_children())
    or itqan.attendance_in_scope(student_id, 'can_view_attendance')
    or itqan.attendance_in_scope(student_id, 'can_manage_attendance')
    or itqan.attendance_in_scope(student_id, 'can_note_attendance')
  );

-- بداية الفصل الدراسي (من إعداد الحضور) لحساب «الأسبوع N، يوم كذا» تلقائياً — لأي مستخدم مسجّل
create or replace function public.itqan_school_calendar()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when itqan.uid() is null then null else
    (select jsonb_build_object('start_date', c.start_date, 'weeks', c.weeks) from itqan.attendance_config c where c.id = 1) end;
$$;
revoke all on function public.itqan_school_calendar() from public;
grant execute on function public.itqan_school_calendar() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 042: الدعم الأكاديمي وملاحظات الحضور' as result;
