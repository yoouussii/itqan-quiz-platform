-- =====================================================================
-- منصة إتقان: 037 — الخطط العلاجية
--  - خطة علاجية لطالب في مهارة (ناتج تعلم) بمادة: نسبة البداية، الهدف، الإجراءات، موعد المتابعة.
--  - سجل متابعة (ملاحظات بتاريخها)، وإنهاء الخطة (تحقق الهدف) أو إلغاؤها.
--  - الطالب يرى خططه، وولي الأمر خطط أبنائه، والطاقم الكل. الإنشاء للمعلم والمدير.
--  - إشعار للطالب وولي أمره عند فتح خطة.
--
-- يتطلب 003 و009 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.remedial_plans (
  id           text primary key default ('rp-' || encode(extensions.gen_random_bytes(6), 'hex')),
  student_id   text not null,
  subject_id   text,
  outcome      text not null check (length(outcome) between 1 and 200),
  teacher_id   text not null,
  teacher_name text not null default '',
  start_pct    int not null default 0 check (start_pct between 0 and 100),
  target_pct   int not null default 80 check (target_pct between 1 and 100),
  actions      text not null default '',
  due_date     date,
  status       text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  -- [{"at": "...", "by": "...", "note": "..."}]
  notes        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists remedial_student_idx on public.remedial_plans (student_id);
create index if not exists remedial_teacher_idx on public.remedial_plans (teacher_id);

alter table public.remedial_plans enable row level security;
revoke all on public.remedial_plans from public, anon, authenticated;
grant select, insert, update, delete on public.remedial_plans to anon, authenticated;

drop policy if exists rp_select on public.remedial_plans;
create policy rp_select on public.remedial_plans for select to anon, authenticated
  using (student_id = itqan.uid() or student_id = any(itqan.my_children()) or itqan.is_staff());
drop policy if exists rp_insert on public.remedial_plans;
create policy rp_insert on public.remedial_plans for insert to anon, authenticated
  with check (teacher_id = itqan.uid() and itqan.my_role() in ('admin', 'teacher') and status = 'active');
drop policy if exists rp_update on public.remedial_plans;
create policy rp_update on public.remedial_plans for update to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin()) with check (teacher_id = itqan.uid() or itqan.is_admin());
drop policy if exists rp_delete on public.remedial_plans;
create policy rp_delete on public.remedial_plans for delete to anon, authenticated
  using (teacher_id = itqan.uid() or itqan.is_admin());

-- إشعار الطالب وولي أمره بفتح خطة علاجية
create or replace function itqan.remedial_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select u.name into v_name from public.users u where u.id::text = new.student_id and u.role::text = 'student';
  if v_name is null then return null; end if;
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-rp-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'خطة علاجية: ' || new.outcome,
          'فتح ' || coalesce(nullif(new.teacher_name, ''), 'المعلم') || ' خطة علاجية لـ' || v_name || ' في مهارة «' || new.outcome
            || '» للوصول إلى ' || new.target_pct || '%'
            || case when new.actions <> '' then '. الإجراءات: ' || left(new.actions, 300) else '' end
            || '. نأمل متابعة الطالب في المنزل.',
          jsonb_build_object('student_ids', jsonb_build_array(new.student_id),
            'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                         where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ? new.student_id)),
          'remedial', new.id, new.teacher_id, new.teacher_name);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists remedial_notify_after_insert on public.remedial_plans;
create trigger remedial_notify_after_insert after insert on public.remedial_plans
  for each row execute function itqan.remedial_notify_trigger();

notify pgrst, 'reload schema';

select '✓ تم تحديث 037: الخطط العلاجية' as result;
