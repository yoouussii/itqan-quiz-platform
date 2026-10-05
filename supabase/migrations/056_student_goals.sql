-- =====================================================================
-- منصة إتقان: 056 — أهداف الطالب الشخصية
--  - الطالب يضع أهدافه: معدل في مادة، أو عدد نقاط، أو عدد اختبارات يكملها (بتاريخ اختياري).
--  - التقدم يحسبه الخادم من نتائجه ونقاطه منذ وضع الهدف، ولا يُسجَّل الهدف محققاً إلا إن بلغه فعلاً،
--    وعندها يُشعر ولي أمره.
--  - يراها الطالب نفسه وولي أمره والطاقم.
--
-- يتطلب 021 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.student_goals (
  id          text primary key default ('sg-' || encode(extensions.gen_random_bytes(6), 'hex')),
  student_id  text not null references public.users(id) on delete cascade,
  kind        text not null check (kind in ('subject_avg', 'points', 'quizzes')),
  subject_id  text,
  target      numeric not null check (target > 0 and target <= 100000),
  deadline    date,
  note        text not null default '' check (char_length(note) <= 200),
  achieved_at timestamptz,
  created_at  timestamptz not null default now(),
  check (kind <> 'subject_avg' or target <= 100)
);
create index if not exists student_goals_student on public.student_goals (student_id, created_at desc);

alter table public.student_goals enable row level security;
drop policy if exists sg_select on public.student_goals;
create policy sg_select on public.student_goals for select to anon, authenticated
  using (student_id = itqan.uid() or student_id = any(itqan.my_children()) or itqan.my_role() in ('admin', 'supervisor', 'teacher'));
drop policy if exists sg_insert on public.student_goals;
create policy sg_insert on public.student_goals for insert to anon, authenticated
  with check (student_id = itqan.uid() and itqan.my_role() = 'student' and achieved_at is null
              and (select count(*) from public.student_goals g where g.student_id = itqan.uid() and g.achieved_at is null) < 6);
drop policy if exists sg_update on public.student_goals;
create policy sg_update on public.student_goals for update to anon, authenticated
  using (student_id = itqan.uid()) with check (student_id = itqan.uid());
drop policy if exists sg_delete on public.student_goals;
create policy sg_delete on public.student_goals for delete to anon, authenticated using (student_id = itqan.uid());
grant select, insert, update, delete on public.student_goals to anon, authenticated;

-- قيمة التقدم منذ إنشاء الهدف (مطابقة لحساب النقاط في الواجهة؛ يتطلب result_points من 021)
create or replace function itqan.goal_value(g public.student_goals)
returns numeric language sql stable security definer set search_path = '' as $$
  with best as (
    select distinct on (s.quiz_id) s.quiz_id, s.percentage, q.subject_id, nullif(to_jsonb(q) ->> 'pass_percentage', '')::numeric pass
      from public.submissions s join public.quizzes q on q.id::text = s.quiz_id::text
     where s.student_id = g.student_id and not coalesce(q.is_deleted, false) and s.completed_at >= g.created_at
     order by s.quiz_id, s.percentage desc nulls last, s.completed_at
  )
  select case g.kind
    when 'subject_avg' then (select round(avg(percentage)) from best where subject_id = g.subject_id)
    when 'quizzes' then (select count(*) from best)
    else coalesce((select sum(itqan.result_points(percentage, pass)) from best), 0)
       + coalesce((select sum(points) from public.student_awards a where a.student_id = g.student_id and a.created_at >= g.created_at), 0)
  end;
$$;

-- تقدّم أهداف طالب (للطالب وولي أمره والطاقم): [{ id, value }]
create or replace function public.itqan_goal_progress(p_student text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if itqan.uid() is null then return null; end if;
  if not coalesce(p_student = itqan.uid() or p_student = any(itqan.my_children()) or itqan.my_role() in ('admin', 'supervisor', 'teacher'), false) then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'value', itqan.goal_value(g))) from public.student_goals g where g.student_id = p_student), '[]'::jsonb);
end $$;
revoke all on function public.itqan_goal_progress(text) from public;
grant execute on function public.itqan_goal_progress(text) to anon, authenticated;
revoke all on function itqan.goal_value(public.student_goals) from public, anon, authenticated;

-- بلوغ الهدف: يتحقق الخادم من التقدم، وتاريخه لا يُرجع للخلف، ويُشعر ولي الأمر مرة واحدة
create or replace function itqan.student_goal_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  new.student_id := old.student_id; new.created_at := old.created_at;
  if old.achieved_at is not null then new.achieved_at := old.achieved_at; end if;
  if old.achieved_at is null and new.achieved_at is not null then
    if coalesce(itqan.goal_value(new), 0) < new.target then raise exception 'goal_not_reached'; end if;
    new.achieved_at := now();
    select name into v_name from public.users where id = new.student_id;
    insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
    values ('ntf-sg-' || encode(extensions.gen_random_bytes(6), 'hex'), 'announcement', '🎯 حقق ' || coalesce(v_name, '') || ' هدفه',
            coalesce(nullif(new.note, ''), 'هدف شخصي') || ' — مبروك!',
            jsonb_build_object('user_ids', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.users
                                           where role::text = 'parent' and coalesce(child_ids, '[]'::jsonb) ? new.student_id)),
            'goal', new.id, new.student_id, coalesce(v_name, ''));
  end if;
  return new;
end $$;
drop trigger if exists student_goal_guard on public.student_goals;
create trigger student_goal_guard before update on public.student_goals
  for each row execute function itqan.student_goal_guard();

notify pgrst, 'reload schema';

select '✓ تم تحديث 056: أهداف الطالب' as result;
