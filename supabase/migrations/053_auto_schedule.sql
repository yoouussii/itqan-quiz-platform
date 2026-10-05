-- =====================================================================
-- منصة إتقان: 053 — مواعيد الإشعارات التلقائية يحددها المدير
--  - الإرسال صار من داخل قاعدة البيانات (pg_cron كل 5 دقائق) بدل جداول GitHub الثابتة،
--    فيتبع الوقت الذي يختاره المدير من رئيسيته:
--      app_settings.morning_summary = { enabled, roles, time: 'HH:MM' }        (افتراضياً 06:45)
--      app_settings.weekly_report   = { enabled, day: 0–6 (الأحد=0), time }    (افتراضياً الخميس 14:40)
--  - يُرسل كل إشعار مرة واحدة في يومه، خلال 3 ساعات من موعده (فلا يُرسل متأخراً جداً).
--
-- يتطلب 050 و051 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create extension if not exists pg_cron;

create table if not exists itqan.auto_runs (
  key      text primary key,
  last_day date,
  last_at  timestamptz,
  result   text
);
revoke all on itqan.auto_runs from public, anon, authenticated;

-- 'HH:MM' → time (مع قيمة افتراضية عند الخطأ)
create or replace function itqan.cfg_time(p text, p_default time)
returns time language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(nullif(btrim(p), '')::time, p_default);
exception when others then return p_default;
end $$;

create or replace function itqan.auto_tick()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Riyadh';
  v_day date := v_now::date;
  v_t time := v_now::time;
  ms jsonb := coalesce((select value from public.app_settings where key = 'morning_summary'), '{}'::jsonb);
  wr jsonb := coalesce((select value from public.app_settings where key = 'weekly_report'), '{}'::jsonb);
  t_ms time := itqan.cfg_time(ms ->> 'time', '06:45');
  t_wr time := itqan.cfg_time(wr ->> 'time', '14:40');
  d_wr int := coalesce(nullif(wr ->> 'day', '')::int, 4);
  out text := '';
  r text;
begin
  -- ملخص الصباح
  if v_t >= t_ms and v_t < t_ms + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'morning_summary'), '-infinity') < v_day then
    r := itqan.morning_digest_notify();
    insert into itqan.auto_runs values ('morning_summary', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'morning:' || r || ' ';
  end if;
  -- التقرير الأسبوعي (extract(dow): الأحد = 0)
  if extract(dow from v_day)::int = d_wr and v_t >= t_wr and v_t < t_wr + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'weekly_report'), '-infinity') < v_day then
    r := itqan.weekly_parent_notify();
    insert into itqan.auto_runs values ('weekly_report', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'weekly:' || r;
  end if;
  return nullif(btrim(out), '');
end $$;
revoke all on function itqan.auto_tick(), itqan.cfg_time(text, time) from public, anon, authenticated;

-- آخر تشغيل لكل إشعار (للمدير)
create or replace function public.itqan_auto_runs()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when itqan.is_admin() then coalesce((select jsonb_object_agg(key, jsonb_build_object('day', last_day, 'at', last_at, 'result', result)) from itqan.auto_runs), '{}'::jsonb) end;
$$;
revoke all on function public.itqan_auto_runs() from public;
grant execute on function public.itqan_auto_runs() to anon, authenticated;

-- الجدولة: كل 5 دقائق (إعادة التشغيل تستبدل المهمة)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'itqan-auto-tick';
  perform cron.schedule('itqan-auto-tick', '*/5 * * * *', 'select itqan.auto_tick()');
end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 053: مواعيد الإشعارات التلقائية' as result;
