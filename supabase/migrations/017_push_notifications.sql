-- =====================================================================
-- منصة إتقان: 017 — إشعارات على الجوال (Web Push)
--  - كل جهاز يفعّل الإشعارات يُحفظ اشتراكه هنا (المستخدم يدير اشتراكات أجهزته فقط).
--  - عند إضافة إشعار في المنصة يحسب الخادم المستلمين بنفس قواعد الموقع
--    (ومعهم أولياء أمور الطلاب المستهدفين)، ويرسلها لدالة Supabase «send-push».
--  - لا شيء يُرسل حتى يُشغَّل GitHub ← Actions ← «Setup push notifications» (يضبط الرابط والمفاتيح).
--
-- يتطلب 003 و009 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to anon, authenticated
  using (user_id = (select itqan.uid()))
  with check (user_id = (select itqan.uid()));

-- رابط الدالة وسرّها (يضبطهما سير عمل الإعداد). خارج public فلا يصل إليه أي مستخدم.
create table if not exists itqan.push_config (
  id            int primary key default 1 check (id = 1),
  function_url  text not null,
  secret        text not null,
  updated_at    timestamptz not null default now()
);
revoke all on itqan.push_config from public, anon, authenticated;

-- مستلمو الإشعار: نفس isForUser في src/services/notificationService.ts + أولياء أمور الطلاب المستهدفين
create or replace function itqan.notification_recipients(p_audience jsonb, p_created_by text)
returns setof text language sql stable security definer set search_path = '' as $$
  with a as (
    select
      coalesce((p_audience ->> 'all')::boolean, false) as all_,
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_audience -> 'roles') = 'array' then p_audience -> 'roles' else '[]' end)), '{}') as roles,
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_audience -> 'class_ids') = 'array' then p_audience -> 'class_ids' else '[]' end)), '{}') as class_ids,
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_audience -> 'student_ids') = 'array' then p_audience -> 'student_ids' else '[]' end)), '{}') as student_ids,
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_audience -> 'user_ids') = 'array' then p_audience -> 'user_ids' else '[]' end)), '{}') as user_ids
  ), direct as (
    select u.id::text as id, u.role
    from public.users u, a
    where u.id::text = any(a.user_ids)
       or (u.role = 'student' and u.id::text = any(a.student_ids))
       or (u.role = 'student' and cardinality(a.class_ids) > 0 and (
             u.class_id::text = any(a.class_ids)
             or exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(to_jsonb(u) -> 'assigned_class_ids') = 'array' then to_jsonb(u) -> 'assigned_class_ids' else '[]' end) c where c = any(a.class_ids))))
       or (a.all_ and (cardinality(a.roles) = 0 or u.role = any(a.roles)))
       or (not a.all_ and cardinality(a.roles) > 0 and cardinality(a.class_ids) = 0 and cardinality(a.student_ids) = 0 and u.role = any(a.roles))
  ), parents as (
    select p.id::text as id
    from public.users p
    where p.role = 'parent'
      and exists (
        select 1 from jsonb_array_elements_text(case when jsonb_typeof(to_jsonb(p) -> 'child_ids') = 'array' then to_jsonb(p) -> 'child_ids' else '[]' end) c
        join direct d on d.id = c and d.role = 'student')
  )
  select id from direct where id is distinct from p_created_by
  union
  select id from parents where id is distinct from p_created_by;
$$;
revoke all on function itqan.notification_recipients(jsonb, text) from public, anon, authenticated;

-- بعد إضافة إشعار: إرسال الاشتراكات المعنية لدالة send-push (لا يُفشل إضافة الإشعار أبداً)
create or replace function itqan.notifications_push_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.push_config;
  v_subs jsonb;
  v_url text;
begin
  select * into v_cfg from itqan.push_config where id = 1;
  if not found then return new; end if;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth))), '[]'::jsonb)
    into v_subs
  from public.push_subscriptions s
  where s.user_id in (select itqan.notification_recipients(new.audience, new.created_by));
  if jsonb_array_length(v_subs) = 0 then return new; end if;

  v_url := case when new.ref_type = 'quiz' and new.ref_id is not null then '/quiz/' || new.ref_id else '/notifications' end;
  perform net.http_post(
    url := v_cfg.function_url,
    body := jsonb_build_object('title', new.title, 'body', left(coalesce(new.body, ''), 300), 'url', v_url, 'tag', new.id, 'subscriptions', v_subs),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_cfg.secret),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'itqan push: %', sqlerrm;
  return new;
end $$;

drop trigger if exists itqan_notifications_push on public.notifications;
create trigger itqan_notifications_push
  after insert on public.notifications
  for each row execute function itqan.notifications_push_trigger();

notify pgrst, 'reload schema';

select '✓ تم تحديث 017: إشعارات الجوال (شغّل بعده «Setup push notifications» من Actions)' as result;
