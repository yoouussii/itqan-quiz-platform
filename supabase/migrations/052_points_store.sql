-- =====================================================================
-- منصة إتقان: 052 — متجر النقاط
--  - store_items: مكافآت يحددها المدير أو صاحب صلاحية can_manage_store (اسم، رمز، سعر بالنقاط، كمية اختيارية).
--  - store_redemptions: طلبات الاستبدال: بانتظار ← معتمد ← سُلِّم، أو مرفوض/ملغى (تُعاد النقاط والكمية).
--  - الرصيد = النقاط المكتسبة (أفضل محاولة لكل اختبار + الجوائز وتحدي اليوم) − المصروف.
--    المستوى ولوحة الشرف يبقيان على المكتسب، فالاستبدال لا يُنقص مستوى الطالب.
--  - كل التغييرات عبر دوال (لا كتابة مباشرة على الطلبات)، مع إشعار المسؤولين والطالب وولي أمره.
--
-- يتطلب 017 و021 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.store_items (
  id          text primary key default ('si-' || encode(extensions.gen_random_bytes(6), 'hex')),
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  emoji       text not null default '🎁' check (char_length(emoji) <= 8),
  cost        int  not null check (cost between 1 and 100000),
  stock       int  check (stock >= 0),
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.store_redemptions (
  id              text primary key default ('sr-' || encode(extensions.gen_random_bytes(6), 'hex')),
  item_id         text references public.store_items(id) on delete set null,
  student_id      text not null references public.users(id) on delete cascade,
  item_title      text not null,
  item_emoji      text not null default '🎁',
  cost            int  not null check (cost > 0),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'delivered', 'rejected', 'cancelled')),
  note            text not null default '',
  handled_by      text,
  handled_by_name text not null default '',
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists store_redemptions_student on public.store_redemptions (student_id, created_at desc);
create index if not exists store_redemptions_status on public.store_redemptions (status, created_at);

create or replace function itqan.store_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_admin() or itqan.has_perm('can_manage_store');
$$;

alter table public.store_items enable row level security;
alter table public.store_redemptions enable row level security;
drop policy if exists si_select on public.store_items;
create policy si_select on public.store_items for select to anon, authenticated using (itqan.uid() is not null);
drop policy if exists si_write on public.store_items;
create policy si_write on public.store_items for all to anon, authenticated
  using (itqan.store_manager()) with check (itqan.store_manager());
drop policy if exists sr_select on public.store_redemptions;
create policy sr_select on public.store_redemptions for select to anon, authenticated
  using (itqan.store_manager() or student_id = itqan.uid() or student_id = any(itqan.my_children()));
grant select, insert, update, delete on public.store_items to anon, authenticated;
grant select on public.store_redemptions to anon, authenticated;

-- النقاط المكتسبة (مطابقة لـ computePointEvents في الواجهة)
create or replace function itqan.student_points_earned(p_student text)
returns int language sql stable security definer set search_path = '' as $$
  select (
    coalesce((select sum(itqan.result_points(b.percentage, b.pass)) from (
      select distinct on (s.quiz_id) s.percentage, nullif(to_jsonb(q) ->> 'pass_percentage', '')::numeric pass
        from public.submissions s join public.quizzes q on q.id::text = s.quiz_id::text
       where s.student_id = p_student and not coalesce(q.is_deleted, false)
       order by s.quiz_id, s.percentage desc nulls last, s.completed_at) b), 0)
    + coalesce((select sum(points) from public.student_awards where student_id = p_student), 0)
  )::int;
$$;

create or replace function itqan.student_points_spent(p_student text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost), 0)::int from public.store_redemptions
   where student_id = p_student and status in ('pending', 'approved', 'delivered');
$$;

create or replace function public.itqan_store_balance(p_student text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s text := coalesce(p_student, itqan.uid()); e int; sp int;
begin
  if itqan.uid() is null then return null; end if;
  if not (v_s = itqan.uid() or v_s = any(itqan.my_children()) or itqan.store_manager()) then return null; end if;
  e := itqan.student_points_earned(v_s); sp := itqan.student_points_spent(v_s);
  return jsonb_build_object('earned', e, 'spent', sp, 'balance', e - sp);
end $$;

-- إشعار الطالب وأولياء أمره
create or replace function itqan.store_notify_student(p_student text, p_title text, p_body text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-st-' || encode(extensions.gen_random_bytes(6), 'hex'), 'announcement', p_title, p_body,
          jsonb_build_object('user_ids', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.users
                                         where id = p_student or (role::text = 'parent' and coalesce(child_ids, '[]'::jsonb) ? p_student))),
          'store', p_ref, null, 'متجر النقاط');
end $$;

-- طلب استبدال (الطالب)
create or replace function public.itqan_store_redeem(p_item text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.users; it public.store_items; bal int; r public.store_redemptions;
begin
  select * into me from public.users where id = itqan.uid();
  if not found or me.role::text <> 'student' then raise exception 'store_students_only'; end if;
  select * into it from public.store_items where id = p_item for update;
  if not found or not it.active then raise exception 'store_item_unavailable'; end if;
  if it.stock is not null and it.stock <= 0 then raise exception 'store_out_of_stock'; end if;
  perform pg_advisory_xact_lock(hashtext('store:' || me.id));
  if (select count(*) from public.store_redemptions where student_id = me.id and status = 'pending') >= 3 then raise exception 'store_too_many_pending'; end if;
  bal := itqan.student_points_earned(me.id) - itqan.student_points_spent(me.id);
  if bal < it.cost then raise exception 'store_not_enough_points'; end if;
  insert into public.store_redemptions (item_id, student_id, item_title, item_emoji, cost)
  values (it.id, me.id, it.title, it.emoji, it.cost) returning * into r;
  if it.stock is not null then update public.store_items set stock = stock - 1 where id = it.id; end if;
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-st-' || encode(extensions.gen_random_bytes(6), 'hex'), 'announcement', 'طلب من متجر النقاط: ' || it.title,
          me.name || ' طلب «' || it.title || '» مقابل ' || it.cost || ' نقطة.',
          jsonb_build_object('roles', jsonb_build_array('admin'), 'user_ids',
            (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.users
              where role::text in ('teacher', 'supervisor') and (coalesce((teacher_permissions ->> 'can_manage_store')::boolean, false) or coalesce((permissions ->> 'can_manage_store')::boolean, false)))),
          'store', r.id, me.id, me.name);
  return to_jsonb(r) || jsonb_build_object('balance', bal - it.cost);
end $$;

-- إلغاء طلب ما زال بانتظار (الطالب)
create or replace function public.itqan_store_cancel(p_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.store_redemptions;
begin
  update public.store_redemptions set status = 'cancelled', handled_at = now()
   where id = p_id and student_id = itqan.uid() and status = 'pending' returning * into r;
  if not found then return false; end if;
  update public.store_items set stock = stock + 1 where id = r.item_id and stock is not null;
  return true;
end $$;

-- اعتماد / تسليم / رفض (المسؤول)
create or replace function public.itqan_store_handle(p_id text, p_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.store_redemptions; me public.users;
begin
  if not itqan.store_manager() then raise exception 'store_not_allowed'; end if;
  if p_status not in ('approved', 'delivered', 'rejected') then raise exception 'store_bad_status'; end if;
  select * into me from public.users where id = itqan.uid();
  update public.store_redemptions
     set status = p_status, note = coalesce(nullif(btrim(p_note), ''), note), handled_by = me.id, handled_by_name = me.name, handled_at = now()
   where id = p_id and (status = 'pending' or (status = 'approved' and p_status in ('delivered', 'rejected')))
   returning * into r;
  if not found then raise exception 'store_bad_transition'; end if;
  if p_status = 'rejected' then
    update public.store_items set stock = stock + 1 where id = r.item_id and stock is not null;
  end if;
  perform itqan.store_notify_student(r.student_id,
    case p_status when 'approved' then '✅ اعتُمد طلبك: ' when 'delivered' then '🎁 استلمت مكافأتك: ' else 'لم يُقبل طلبك: ' end || r.item_title,
    case p_status when 'rejected' then 'أُعيدت ' || r.cost || ' نقطة إلى الرصيد.' when 'approved' then 'ستُسلَّم لك المكافأة قريباً.' else 'مبروك! استُبدلت ' || r.cost || ' نقطة.' end
      || case when btrim(coalesce(p_note, '')) <> '' then E'\n' || btrim(p_note) else '' end,
    r.id);
  return to_jsonb(r);
end $$;

revoke all on function public.itqan_store_balance(text), public.itqan_store_redeem(text), public.itqan_store_cancel(text), public.itqan_store_handle(text, text, text) from public;
grant execute on function public.itqan_store_balance(text), public.itqan_store_redeem(text), public.itqan_store_cancel(text), public.itqan_store_handle(text, text, text) to anon, authenticated;
revoke all on function itqan.student_points_earned(text), itqan.student_points_spent(text), itqan.store_notify_student(text, text, text, text) from public, anon, authenticated;
grant execute on function itqan.store_manager() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 052: متجر النقاط' as result;
