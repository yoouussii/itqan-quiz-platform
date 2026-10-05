-- =====================================================================
-- منصة إتقان: 050 — الملخص الصباحي للمدير
--  - itqan_morning_summary(): أرقام اليوم في مكان واحد: غياب آخر يوم دراسي وأكثر الفصول غياباً،
--    والطلاب المتكرر غيابهم، واختبارات اليوم، وما ينتظر الاعتماد، والواجبات، والسلوك،
--    وسجلات المتابعة المتأخرة. للمدير والمشرف فقط.
--  - itqan.morning_digest_notify(): يرسل الملخص إشعاراً (ويصل للجوال عبر إشعارات الدفع) للمديرين،
--    ويستدعيه سير عمل «Morning summary» كل صباح دراسي.
--  - الإعداد: app_settings.morning_summary = { enabled, roles } (افتراضياً مفعّل للمديرين).
--
-- يتطلب 017 و022 و031 و040 و043 قبله. آمن لإعادة التشغيل.
-- =====================================================================

-- آخر يوم دراسي قبل اليوم (الأحد–الخميس)
create or replace function itqan.prev_school_day(p_day date)
returns date language sql immutable set search_path = '' as $$
  select max(d)::date from generate_series(p_day - 7, p_day - 1, interval '1 day') d
   where extract(isodow from d) not in (5, 6);
$$;

create or replace function itqan.morning_summary_data(p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_prev date := itqan.prev_school_day(p_day);
  v jsonb;
begin
  select jsonb_build_object(
    'day', p_day,
    'prev_day', v_prev,
    'students', (select count(*) from public.users where role::text = 'student'),
    'absent', (select count(*) from public.attendance_records where day = v_prev and kind = 'absent'),
    'late', (select count(*) from public.attendance_records where day = v_prev and kind = 'late'),
    'excused', (select count(*) from public.attendance_records where day = v_prev and kind = 'excused'),
    'top_classes', coalesce((
      select jsonb_agg(x order by x.n desc) from (
        select c.id, c.name, count(*) as n
          from public.attendance_records a join public.users u on u.id::text = a.student_id
          join public.classes c on c.id::text = u.class_id
         where a.day = v_prev and a.kind = 'absent'
         group by c.id, c.name order by count(*) desc limit 5) x), '[]'::jsonb),
    'repeat_absent', (
      select count(*) from (select student_id from public.attendance_records
        where kind = 'absent' and day between p_day - 14 and v_prev group by student_id having count(*) >= 3) r),
    'quizzes_today', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title) order by q.start_date) from public.quizzes q
       where coalesce(q.is_deleted, false) = false and q.status = 'published'
         and (q.start_date is null or (q.start_date at time zone 'Asia/Riyadh')::date <= p_day)
         and q.end_date is not null and (q.end_date at time zone 'Asia/Riyadh')::date = p_day), '[]'::jsonb),
    'quizzes_open', (select count(*) from public.quizzes q where coalesce(q.is_deleted, false) = false and q.status = 'published'
         and (q.start_date is null or q.start_date <= now()) and (q.end_date is null or q.end_date >= now())),
    'pending_approval', (select count(*) from public.quizzes where status = 'pending_approval' and coalesce(is_deleted, false) = false),
    'homework_due_today', (select count(*) from public.homework where (due_at at time zone 'Asia/Riyadh')::date = p_day),
    'homework_ungraded', (select count(*) from public.homework_submissions s join public.homework h on h.id = s.homework_id
         where s.score is null and h.max_score is not null and s.submitted_at < now() - interval '2 days'),
    'behavior_negative', (select count(*) from public.behavior_records where day = v_prev and coalesce(points, 0) < 0),
    'records_stale', (select count(distinct file_key) from public.class_record_sheets
         where kind = 'followup' and (last_edit_at is null or last_edit_at < now() - interval '10 days'))
  ) into v;
  return v;
end $$;

-- للمدير والمشرف داخل المنصة
create or replace function public.itqan_morning_summary(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (itqan.is_admin() or itqan.my_role() = 'supervisor') then return null; end if;
  return itqan.morning_summary_data(coalesce(p_day, (now() at time zone 'Asia/Riyadh')::date));
end $$;

-- الإشعار الصباحي (يستدعيه سير العمل المجدول بصلاحية قاعدة البيانات)
create or replace function itqan.morning_digest_notify()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Asia/Riyadh')::date;
  cfg jsonb := coalesce((select value from public.app_settings where key = 'morning_summary'), '{}'::jsonb);
  d jsonb; v_body text; v_roles jsonb; v_wd text;
begin
  if extract(isodow from v_day) in (5, 6) then return 'weekend'; end if;
  if coalesce((cfg ->> 'enabled')::boolean, true) = false then return 'disabled'; end if;
  v_roles := case when jsonb_typeof(cfg -> 'roles') = 'array' and jsonb_array_length(cfg -> 'roles') > 0 then cfg -> 'roles' else '["admin"]'::jsonb end;
  d := itqan.morning_summary_data(v_day);
  v_wd := (array['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'])[extract(isodow from v_day)::int];
  v_body := concat_ws(E'\n',
    '• غياب آخر يوم دراسي: ' || (d ->> 'absent') || ' غائب، ' || (d ->> 'late') || ' متأخر، ' || (d ->> 'excused') || ' مستأذن'
      || case when jsonb_array_length(d -> 'top_classes') > 0 then ' — الأكثر: ' || (d -> 'top_classes' -> 0 ->> 'name') || ' (' || (d -> 'top_classes' -> 0 ->> 'n') || ')' else '' end,
    case when (d ->> 'repeat_absent')::int > 0 then '• ' || (d ->> 'repeat_absent') || ' طالب غاب 3 أيام أو أكثر خلال أسبوعين' end,
    '• اختبارات تنتهي اليوم: ' || jsonb_array_length(d -> 'quizzes_today') || '، والمفتوحة الآن: ' || (d ->> 'quizzes_open'),
    case when (d ->> 'pending_approval')::int > 0 then '• بانتظار اعتمادك: ' || (d ->> 'pending_approval') || ' اختبار' end,
    case when (d ->> 'homework_due_today')::int > 0 then '• واجبات موعدها اليوم: ' || (d ->> 'homework_due_today') end,
    case when (d ->> 'homework_ungraded')::int > 0 then '• تسليمات واجبات لم تُصحح منذ يومين: ' || (d ->> 'homework_ungraded') end,
    case when (d ->> 'behavior_negative')::int > 0 then '• مخالفات سلوكية أمس: ' || (d ->> 'behavior_negative') end,
    case when (d ->> 'records_stale')::int > 0 then '• سجلات متابعة لم تُعدَّل منذ 10 أيام: ' || (d ->> 'records_stale') end);
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-ms-' || to_char(v_day, 'YYYYMMDD') || '-' || encode(extensions.gen_random_bytes(3), 'hex'), 'announcement',
          'ملخص صباح ' || v_wd, v_body, jsonb_build_object('roles', v_roles), 'morning_summary', to_char(v_day, 'YYYY-MM-DD'), null, 'منصة إتقان');
  return 'sent';
end $$;

revoke all on function public.itqan_morning_summary(date) from public;
grant execute on function public.itqan_morning_summary(date) to anon, authenticated;
revoke all on function itqan.morning_digest_notify(), itqan.morning_summary_data(date) from public, anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 050: الملخص الصباحي' as result;
