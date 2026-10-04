-- =====================================================================
-- منصة إتقان: 040 — الواجبات والمرفقات الدراسية
--  - المعلم ينشر واجباً لفصل ومادة من إسناداته (المدير لأي فصل): تعليمات، موعد تسليم،
--    روابط (فيديو/مواقع)، ومرفقات (PDF وصور).
--  - الطالب يرى واجبات فصله ويسلّم إجابة نصية و/أو ملفات، ويعدّلها حتى يصححها المعلم.
--  - المعلم يصحح: درجة وملاحظة، ويصل إشعار للطالب وولي أمره.
--  - ولي الأمر يرى واجبات أبنائه وحالة تسليمها.
--  - الملفات تُخزَّن في قاعدة البيانات (حد 5MB للملف) لأن الدخول بجلسات المنصة لا بحسابات Supabase،
--    والفيديو روابط فقط (يوتيوب/درايف) حفاظاً على مساحة الخطة المجانية.
--  - المدير ينظّف الواجبات القديمة بمرفقاتها لتوفير المساحة.
--
-- يتطلب 003 و009 و036 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.homework (
  id               text primary key default ('hw-' || encode(extensions.gen_random_bytes(6), 'hex')),
  class_id         text not null,
  subject_id       text,
  teacher_id       text not null,
  teacher_name     text not null default '',
  title            text not null check (length(title) between 1 and 200),
  body             text not null default '' check (length(body) <= 5000),
  -- [{"title": "...", "url": "https://..."}]
  links            jsonb not null default '[]'::jsonb,
  due_at           timestamptz,
  allow_submission boolean not null default true,
  max_score        numeric check (max_score is null or max_score > 0),
  created_at       timestamptz not null default now()
);
create index if not exists homework_class_idx on public.homework (class_id, created_at desc);
create index if not exists homework_teacher_idx on public.homework (teacher_id);

create table if not exists public.homework_submissions (
  id           text primary key default ('hws-' || encode(extensions.gen_random_bytes(6), 'hex')),
  homework_id  text not null references public.homework (id) on delete cascade,
  student_id   text not null,
  answer       text not null default '' check (length(answer) <= 10000),
  submitted_at timestamptz not null default now(),
  score        numeric,
  feedback     text not null default '',
  graded_by    text,
  graded_at    timestamptz,
  unique (homework_id, student_id)
);
create index if not exists hws_student_idx on public.homework_submissions (student_id);

create table if not exists public.homework_files (
  id            text primary key default ('hwf-' || encode(extensions.gen_random_bytes(8), 'hex')),
  homework_id   text references public.homework (id) on delete cascade,
  submission_id text references public.homework_submissions (id) on delete cascade,
  name          text not null check (length(name) between 1 and 200),
  mime          text not null default 'application/octet-stream',
  size          int not null default 0,
  -- محتوى الملف base64 (حد ~5MB للملف الأصلي)
  data          text not null check (octet_length(data) <= 7000000),
  uploaded_by   text not null,
  created_at    timestamptz not null default now(),
  check ((homework_id is null) <> (submission_id is null))
);
create index if not exists hwf_homework_idx on public.homework_files (homework_id);
create index if not exists hwf_submission_idx on public.homework_files (submission_id);

-- ---------------------------------------------------------------------
-- من يرى الواجب؟ الطاقم، وطلاب الفصل، وأولياء أمورهم
-- ---------------------------------------------------------------------
create or replace function itqan.hw_visible(p_hw text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_staff() or exists (
    select 1 from public.homework h
      join public.users u on u.class_id = h.class_id and u.role::text = 'student'
     where h.id = p_hw and (u.id::text = itqan.uid() or u.id::text = any(itqan.my_children())));
$$;

-- هل المستخدم معلم الواجب أو المدير؟
create or replace function itqan.hw_owner(p_hw text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_admin() or exists (select 1 from public.homework h where h.id = p_hw and h.teacher_id = itqan.uid());
$$;

-- هل الطالب الحالي يستطيع التسليم في هذا الواجب؟
create or replace function itqan.hw_can_submit(p_hw text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.homework h join public.users u on u.class_id = h.class_id
     where h.id = p_hw and h.allow_submission and u.id::text = itqan.uid() and u.role::text = 'student');
$$;

create or replace function itqan.hws_visible(p_sub text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.homework_submissions s
     where s.id = p_sub and (s.student_id = itqan.uid() or s.student_id = any(itqan.my_children()) or itqan.is_staff()));
$$;

create or replace function itqan.hws_mine_open(p_sub text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.homework_submissions s where s.id = p_sub and s.student_id = itqan.uid() and s.score is null);
$$;

grant execute on function itqan.hw_visible(text), itqan.hw_owner(text), itqan.hw_can_submit(text),
  itqan.hws_visible(text), itqan.hws_mine_open(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.homework enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.homework_files enable row level security;
revoke all on public.homework, public.homework_submissions, public.homework_files from public, anon, authenticated;
grant select, insert, update, delete on public.homework, public.homework_submissions, public.homework_files to anon, authenticated;

drop policy if exists hw_select on public.homework;
create policy hw_select on public.homework for select to anon, authenticated using (itqan.hw_visible(id));
drop policy if exists hw_insert on public.homework;
create policy hw_insert on public.homework for insert to anon, authenticated
  with check (teacher_id = itqan.uid()
              and (itqan.is_admin() or (itqan.my_role() = 'teacher' and itqan.teaches(class_id, subject_id))));
drop policy if exists hw_update on public.homework;
create policy hw_update on public.homework for update to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin()) with check (teacher_id = itqan.uid() or itqan.is_admin());
drop policy if exists hw_delete on public.homework;
create policy hw_delete on public.homework for delete to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin());

drop policy if exists hws_select on public.homework_submissions;
create policy hws_select on public.homework_submissions for select to anon, authenticated
  using (student_id = itqan.uid() or student_id = any(itqan.my_children()) or itqan.is_staff());
drop policy if exists hws_insert on public.homework_submissions;
create policy hws_insert on public.homework_submissions for insert to anon, authenticated
  with check (student_id = itqan.uid() and itqan.hw_can_submit(homework_id) and score is null);
-- الطالب يعدّل تسليمه قبل التصحيح، ومعلم الواجب/المدير يصحح
drop policy if exists hws_update on public.homework_submissions;
create policy hws_update on public.homework_submissions for update to anon, authenticated
  using ((student_id = itqan.uid() and score is null) or itqan.hw_owner(homework_id))
  with check ((student_id = itqan.uid() and score is null) or itqan.hw_owner(homework_id));
drop policy if exists hws_delete on public.homework_submissions;
create policy hws_delete on public.homework_submissions for delete to anon, authenticated
  using ((student_id = itqan.uid() and score is null) or itqan.hw_owner(homework_id));

drop policy if exists hwf_select on public.homework_files;
create policy hwf_select on public.homework_files for select to anon, authenticated
  using ((homework_id is not null and itqan.hw_visible(homework_id))
      or (submission_id is not null and itqan.hws_visible(submission_id)));
drop policy if exists hwf_insert on public.homework_files;
create policy hwf_insert on public.homework_files for insert to anon, authenticated
  with check (uploaded_by = itqan.uid()
    and ((homework_id is not null and itqan.hw_owner(homework_id))
      or (submission_id is not null and itqan.hws_mine_open(submission_id))));
drop policy if exists hwf_delete on public.homework_files;
create policy hwf_delete on public.homework_files for delete to anon, authenticated
  using ((homework_id is not null and itqan.hw_owner(homework_id))
      or (submission_id is not null and itqan.hws_mine_open(submission_id)));

-- ---------------------------------------------------------------------
-- حماية الحقول: الطالب لا يكتب الدرجة، والمعلم لا يغيّر إجابة الطالب
-- ---------------------------------------------------------------------
create or replace function itqan.hws_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner boolean := itqan.hw_owner(new.homework_id);
begin
  if tg_op = 'INSERT' then
    new.score := null; new.feedback := ''; new.graded_by := null; new.graded_at := null; new.submitted_at := now();
    return new;
  end if;
  new.homework_id := old.homework_id; new.student_id := old.student_id;
  if new.student_id = itqan.uid() and not v_owner then
    new.score := old.score; new.feedback := old.feedback; new.graded_by := old.graded_by; new.graded_at := old.graded_at;
    if new.answer is distinct from old.answer then new.submitted_at := now(); else new.submitted_at := old.submitted_at; end if;
  else
    new.answer := old.answer; new.submitted_at := old.submitted_at;
    if new.score is distinct from old.score or new.feedback is distinct from old.feedback then
      new.graded_by := itqan.uid(); new.graded_at := case when new.score is null then null else now() end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hws_guard on public.homework_submissions;
create trigger hws_guard before insert or update on public.homework_submissions
  for each row execute function itqan.hws_guard_trigger();

create or replace function itqan.hwf_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.size := (octet_length(new.data) * 3) / 4;
  if new.submission_id is not null and (select count(*) from public.homework_files f where f.submission_id = new.submission_id) >= 5 then
    raise exception 'too_many_files';
  end if;
  if new.homework_id is not null and (select count(*) from public.homework_files f where f.homework_id = new.homework_id) >= 10 then
    raise exception 'too_many_files';
  end if;
  return new;
end $$;
drop trigger if exists hwf_guard on public.homework_files;
create trigger hwf_guard before insert on public.homework_files
  for each row execute function itqan.hwf_guard_trigger();

-- ---------------------------------------------------------------------
-- الإشعارات: واجب جديد (الطلاب وأولياء أمورهم)، وتصحيح التسليم
-- ---------------------------------------------------------------------
create or replace function itqan.homework_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_students jsonb; v_subject text;
begin
  select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_students
    from public.users u where u.role::text = 'student' and u.class_id = new.class_id;
  if jsonb_array_length(v_students) = 0 then return null; end if;
  select s.name into v_subject from public.subjects s where s.id::text = new.subject_id;
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-hw-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'واجب جديد: ' || new.title,
          coalesce(v_subject || ' · ', '') || coalesce(nullif(new.teacher_name, ''), 'المعلم')
            || case when new.due_at is not null then ' · التسليم ' || to_char(new.due_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') else '' end
            || case when new.body <> '' then E'\n' || left(new.body, 300) else '' end,
          jsonb_build_object('student_ids', v_students,
            'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                         where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ?| array(select jsonb_array_elements_text(v_students)))),
          'homework', new.id, new.teacher_id, new.teacher_name);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists homework_notify_after_insert on public.homework;
create trigger homework_notify_after_insert after insert on public.homework
  for each row execute function itqan.homework_notify_trigger();

create or replace function itqan.hws_graded_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare h public.homework;
begin
  if new.score is null or old.score is not distinct from new.score then return null; end if;
  select * into h from public.homework where id = new.homework_id;
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-hwg-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'تصحيح واجب: ' || h.title,
          'الدرجة ' || trim(to_char(new.score, 'FM999990.##')) || coalesce(' من ' || trim(to_char(h.max_score, 'FM999990.##')), '')
            || case when new.feedback <> '' then E'\n' || left(new.feedback, 300) else '' end,
          jsonb_build_object('student_ids', jsonb_build_array(new.student_id),
            'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                         where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ? new.student_id)),
          'homework', h.id, h.teacher_id, h.teacher_name);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists hws_graded_notify on public.homework_submissions;
create trigger hws_graded_notify after update of score on public.homework_submissions
  for each row execute function itqan.hws_graded_notify_trigger();

-- ---------------------------------------------------------------------
-- المساحة والتنظيف (للمدير)
-- ---------------------------------------------------------------------
create or replace function public.itqan_homework_storage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not itqan.is_staff() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'homework', (select count(*) from public.homework),
    'files', (select count(*) from public.homework_files),
    'bytes', (select coalesce(sum(size), 0) from public.homework_files),
    'oldest', (select min(created_at) from public.homework));
end $$;

create or replace function public.itqan_homework_purge(p_before date)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not itqan.is_admin() then raise exception 'forbidden'; end if;
  if p_before is null or p_before > current_date then raise exception 'bad_date'; end if;
  delete from public.homework where created_at < p_before;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.itqan_homework_storage(), public.itqan_homework_purge(date) from public;
grant execute on function public.itqan_homework_storage(), public.itqan_homework_purge(date) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 040: الواجبات والمرفقات الدراسية' as result;
