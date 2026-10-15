-- =====================================================================
-- منصة إتقان: 080 — مراقبة الاستهلاك (حجم التنزيل من قاعدة البيانات)
--  - كل جهاز يحسب حجم ما ينزّله من Supabase، ويرسل المجموع مرة كل ساعتين تقريباً
--    (كتابة صغيرة واحدة لكل مستخدم، لا ضغط يُذكر).
--  - مدير النظام يرى مجموع آخر 30 يوماً مقارنة بحد الخطة (5 جيجابايت شهرياً في المجانية)،
--    وتوزيعه على الأيام والأدوار. الرقم تقديري (قد يختلف قليلاً عن لوحة Supabase).
--  - تُحذف السجلات الأقدم من 120 يوماً تلقائياً.
--
-- يتطلب 003. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists itqan.usage_daily (
  day       date not null,
  user_id   text not null,
  role      text,
  bytes     bigint not null default 0,
  requests  integer not null default 0,
  primary key (day, user_id)
);
alter table itqan.usage_daily enable row level security;
revoke all on itqan.usage_daily from public, anon, authenticated;

create or replace function public.itqan_report_usage(p_bytes bigint, p_requests int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid(); v_role text;
begin
  if v_uid is null then return; end if;
  select u.role::text into v_role from public.users u where u.id::text = v_uid;
  insert into itqan.usage_daily as d (day, user_id, role, bytes, requests)
  values ((now() at time zone 'Asia/Riyadh')::date, v_uid, v_role,
          greatest(0, least(coalesce(p_bytes, 0), 2000000000)), greatest(0, least(coalesce(p_requests, 0), 1000000)))
  on conflict (day, user_id) do update
    set bytes = d.bytes + excluded.bytes, requests = d.requests + excluded.requests, role = excluded.role;
  if random() < 0.01 then
    delete from itqan.usage_daily where day < current_date - 120;
  end if;
end $$;

create or replace function public.itqan_usage_summary(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_since date := (now() at time zone 'Asia/Riyadh')::date - greatest(1, least(coalesce(p_days, 30), 120)) + 1;
begin
  if not coalesce(itqan.is_admin(), false) then return null; end if;
  return jsonb_build_object(
    'since', v_since,
    'total_bytes', (select coalesce(sum(bytes), 0) from itqan.usage_daily where day >= v_since),
    'total_requests', (select coalesce(sum(requests), 0) from itqan.usage_daily where day >= v_since),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'bytes', b, 'requests', r, 'users', n) order by day)
                      from (select day, sum(bytes) b, sum(requests) r, count(*) n from itqan.usage_daily
                            where day >= v_since group by day) x), '[]'::jsonb),
    'by_role', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'bytes', b, 'users', n) order by b desc)
                         from (select coalesce(role, '?') role, sum(bytes) b, count(distinct user_id) n from itqan.usage_daily
                               where day >= v_since group by 1) y), '[]'::jsonb)
  );
end $$;

revoke all on function public.itqan_report_usage(bigint, int) from public;
revoke all on function public.itqan_usage_summary(int) from public;
grant execute on function public.itqan_report_usage(bigint, int) to anon, authenticated;
grant execute on function public.itqan_usage_summary(int) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 080: مراقبة الاستهلاك' as result;
