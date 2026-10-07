-- =====================================================================
-- منصة إتقان: 063 — جدول الاختبارات اليدوي وأنواع الزيارات الصفية
--  - exam_schedule: المعلم (أو المدير) يضيف مواعيد الاختبارات لفصوله، ومنها الاختبارات الورقية،
--    مصنّفة: اختبار الفترة الأولى، والفترة الثانية، والنهائي، والقصير، وغيرها.
--    يراها الطاقم، وطلاب الفصل، وأولياء أمورهم، ويصل إشعار للطلاب وأولياء الأمور.
--  - class_visits.visit_type: نوع الزيارة (مدير المدرسة، الوكيل، المشرف التعليمي، زيارة تبادلية، أخرى).
--
-- يتطلب 003 و009 و034 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.exam_schedule (
  id            text primary key default ('ex-' || encode(extensions.gen_random_bytes(6), 'hex')),
  class_id      text not null,
  subject_id    text,
  title         text not null check (char_length(trim(title)) between 1 and 200),
  period        text not null default 'p1' check (period in ('p1', 'p2', 'final', 'short', 'other')),
  exam_date     date not null,
  start_time    text check (start_time is null or start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  lessons       text not null default '' check (char_length(lessons) <= 1000),
  teacher_id    text not null,
  teacher_name  text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists exam_schedule_class_idx on public.exam_schedule (class_id, exam_date);
create index if not exists exam_schedule_date_idx on public.exam_schedule (exam_date);

create or replace function itqan.exam_visible(p_class text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_staff() or exists (
    select 1 from public.users u
     where u.class_id = p_class and u.role::text = 'student'
       and (u.id::text = itqan.uid() or u.id::text = any(itqan.my_children())));
$$;
grant execute on function itqan.exam_visible(text) to anon, authenticated;

alter table public.exam_schedule enable row level security;
revoke all on public.exam_schedule from public, anon, authenticated;
grant select, insert, update, delete on public.exam_schedule to anon, authenticated;

drop policy if exists ex_select on public.exam_schedule;
create policy ex_select on public.exam_schedule for select to anon, authenticated using (itqan.exam_visible(class_id));
drop policy if exists ex_insert on public.exam_schedule;
create policy ex_insert on public.exam_schedule for insert to anon, authenticated
  with check (teacher_id = itqan.uid() and itqan.is_staff());
drop policy if exists ex_update on public.exam_schedule;
create policy ex_update on public.exam_schedule for update to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin()) with check (teacher_id = itqan.uid() or itqan.is_admin());
drop policy if exists ex_delete on public.exam_schedule;
create policy ex_delete on public.exam_schedule for delete to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin());

-- إشعار طلاب الفصل وأولياء أمورهم بموعد الاختبار
create or replace function itqan.exam_schedule_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_students jsonb; v_subject text; v_kind text;
begin
  if new.exam_date < current_date then return null; end if;
  select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_students
    from public.users u where u.role::text = 'student' and u.class_id = new.class_id;
  if jsonb_array_length(v_students) = 0 then return null; end if;
  select s.name into v_subject from public.subjects s where s.id::text = new.subject_id;
  v_kind := case new.period when 'p1' then 'اختبار الفترة الأولى' when 'p2' then 'اختبار الفترة الثانية'
                            when 'final' then 'الاختبار النهائي' when 'short' then 'اختبار قصير' else 'اختبار' end;
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-ex-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'موعد اختبار: ' || new.title,
          v_kind || coalesce(' · ' || v_subject, '') || ' · ' || to_char(new.exam_date, 'YYYY-MM-DD')
            || coalesce(' ' || new.start_time, '')
            || case when new.lessons <> '' then E'\nالمقرر: ' || left(new.lessons, 300) else '' end,
          jsonb_build_object('student_ids', v_students,
            'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                         where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ?| array(select jsonb_array_elements_text(v_students)))),
          'exam_schedule', new.id, new.teacher_id, new.teacher_name);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists exam_schedule_notify_after_insert on public.exam_schedule;
create trigger exam_schedule_notify_after_insert after insert on public.exam_schedule
  for each row execute function itqan.exam_schedule_notify_trigger();

-- ---------------------------------------------------------------------
-- نوع الزيارة الصفية
-- ---------------------------------------------------------------------
alter table public.class_visits add column if not exists visit_type text not null default 'principal';
do $$ begin
  alter table public.class_visits add constraint class_visits_type_chk
    check (visit_type in ('principal', 'vice', 'supervisor', 'peer', 'other'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 063: جدول الاختبارات وأنواع الزيارات' as result;
