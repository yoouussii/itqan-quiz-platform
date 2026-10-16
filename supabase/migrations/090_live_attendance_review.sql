-- =====================================================================
-- 090: مراجعة المعلم لحضور الحصة واعتماده
--  - بعد انتهاء الحصة يرى المعلم (أو المدير) الحضور المحسوب تلقائياً، ويعدّل حالة أي طالب
--    (حاضر / متأخر / غائب / مستأذن)، ثم «اعتماد وإرسال».
--  - عند اعتماد كل حصص الفصل في ذلك اليوم يُحسب سجل اليوم فوراً ويُكتب في شيت جوجل
--    (وإعادة الاعتماد بعد تعديل تُصحّح السجل والشيت). إن لم يعتمد المعلم يُحسب تلقائياً
--    بعد ساعتين من انتهاء آخر حصة للفصل.
--  - سجل اليوم: غاب/استأذن عن كل الحصص ← «غياب» (أو «استئذان» إن استأذن في أي منها)،
--    وإلا فإن كان متأخراً أو غائباً في أول حصة ← «تأخر».
--  يتطلب 083–089. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.live_attendance add column if not exists override text check (override is null or override in ('present', 'late', 'absent', 'excused'));
alter table public.live_attendance add column if not exists override_by text;
alter table public.live_sessions add column if not exists att_submitted_at timestamptz;
alter table public.live_sessions add column if not exists att_submitted_by text;
-- الكتابة في الشيت: تعليم الخانة (true) أو إزالة العلامة (false) عند تصحيح السجل
alter table itqan.attendance_writeback add column if not exists value boolean not null default true;

-- الحالة: تعديل المعلم أولاً، ثم الحساب التلقائي (088)
create or replace function itqan.live_att_status(s public.live_sessions, a public.live_attendance)
returns text language sql stable set search_path = '' as $$
  with w as (
    select greatest(s.starts_at, coalesce(s.started_at, s.starts_at)) as st,
           least(s.starts_at + make_interval(mins => s.duration_min),
                 coalesce(s.ended_at, s.starts_at + make_interval(mins => s.duration_min))) as en)
  select case
    when itqan.live_state(s) <> 'ended' then null
    when a.override is not null then a.override
    when a.session_id is null or a.joins = 0 then 'absent'
    when s.external_url is not null then
      case when a.first_join > w.st + interval '10 minutes' then 'late' else 'present' end
    when a.seconds * 2 < greatest(extract(epoch from w.en - w.st), 60) then 'absent'
    when a.first_join > w.st + interval '10 minutes' then 'late'
    else 'present' end
  from w;
$$;

create or replace function itqan.live_row(s public.live_sessions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'series_id', s.series_id, 'class_ids', s.class_ids, 'subject_id', s.subject_id,
    'teacher_id', s.teacher_id, 'teacher_name', s.teacher_name, 'title', s.title, 'notes', s.notes,
    'starts_at', s.starts_at, 'duration_min', s.duration_min, 'period', s.period, 'status', itqan.live_state(s),
    'started_at', s.started_at, 'ended_at', s.ended_at, 'chat_locked', s.chat_locked,
    'can_manage', itqan.live_owner(s),
    'external', s.external_url is not null,
    'provider', case when s.zoom_meeting is not null then 'zoom' when s.external_url is not null then 'external' else 'jitsi' end,
    'zoom_meeting', case when itqan.live_owner(s) then s.zoom_meeting end,
    'zoom_passcode', case when itqan.live_owner(s) then s.zoom_passcode end,
    'external_url', case when itqan.live_owner(s) then s.external_url end,
    'att_submitted_at', s.att_submitted_at,
    'attended', (select jsonb_build_object('seconds', a.seconds, 'first_join', a.first_join)
                   from public.live_attendance a where a.session_id = s.id and a.user_id = itqan.uid() and a.joins > 0));
$$;

-- كشف الحضور: مع تعديل المعلم
create or replace function public.itqan_live_attendance(p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null or not itqan.is_staff() or not itqan.live_visible(s) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'class_id', u.class_id,
             'first_join', case when coalesce(a.joins, 0) > 0 then a.first_join end, 'last_seen', a.last_seen,
             'seconds', coalesce(a.seconds, 0), 'joins', coalesce(a.joins, 0),
             'status', itqan.live_att_status(s, a), 'override', a.override)
             order by (coalesce(a.joins, 0) = 0), u.name)
      from public.users u
      left join public.live_attendance a on a.session_id = s.id and a.user_id = u.id::text
     where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id), '[]'::jsonb);
end $$;

-- سجل يوم فصل: يُحسب من حالات الحصص ويُصحَّح (مع الشيت) إن سبق حسابه
create or replace function itqan.live_day_compute(p_class text, p_day date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  u record; v_cfg itqan.attendance_config; v_sts text[]; v_title text; v_kind text; v_id bigint;
  v_off int; v_sn itqan.attendance_sheet_names; v_n int := 0; o record;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  insert into itqan.live_day_final (class_id, day) values (p_class, p_day)
  on conflict (class_id, day) do update set at = now();
  for u in select id::text as id from public.users where role::text = 'student' and class_id = p_class loop
    select array_agg(t.st order by t.at), (array_agg(t.title order by t.at))[1]
      into v_sts, v_title
      from (select itqan.live_att_status(s, a) as st, s.title,
                   greatest(s.starts_at, coalesce(s.started_at, s.starts_at)) as at
              from public.live_sessions s
              left join public.live_attendance a on a.session_id = s.id and a.user_id = u.id
             where s.class_ids ? p_class and (s.starts_at at time zone 'Asia/Riyadh')::date = p_day
               and itqan.live_state(s) = 'ended') t;
    continue when v_sts is null;
    v_kind := case
      when v_sts <@ array['absent', 'excused'] then case when 'excused' = any(v_sts) then 'excused' else 'absent' end
      when v_sts[1] in ('late', 'absent') then 'late' end;

    -- تصحيح ما سبق تسجيله من الحصص المباشرة لهذا اليوم
    for o in delete from public.attendance_records r
              where r.student_id = u.id and r.day = p_day and r.source = 'live' and r.kind is distinct from v_kind
              returning r.kind loop
      select * into v_sn from itqan.attendance_sheet_names where student_id = u.id;
      v_off := p_day - v_cfg.start_date;
      if v_sn.student_id is not null and v_cfg.start_date is not null and v_off >= 0 and v_off % 7 <= 4 and v_off / 7 + 1 <= coalesce(v_cfg.weeks, 0) then
        insert into itqan.attendance_writeback (student_id, day, kind, sheet, raw_name, week, dow, value)
        values (u.id, p_day, o.kind, v_sn.sheet, v_sn.raw_name, v_off / 7 + 1, v_off % 7, false);
      end if;
    end loop;

    continue when v_kind is null;
    -- استئذان مسجّل من الشيت أو يدوياً: لا غياب ولا تأخر
    continue when v_kind <> 'excused' and exists (select 1 from public.attendance_records x
                    where x.student_id = u.id and x.day = p_day and x.kind = 'excused' and x.source <> 'live');
    v_id := null;
    insert into public.attendance_records (student_id, day, kind, source, note, created_by)
    values (u.id, p_day, v_kind, 'live',
            case when v_kind = 'late' then 'الحصص المباشرة: ' || coalesce(v_title, '') else 'الحصص المباشرة' end, 'live')
    on conflict (student_id, day, kind) do nothing
    returning id into v_id;
    continue when v_id is null;
    v_n := v_n + 1;
    select * into v_sn from itqan.attendance_sheet_names where student_id = u.id;
    continue when v_sn.student_id is null or v_cfg.start_date is null;
    v_off := p_day - v_cfg.start_date;
    continue when v_off < 0 or v_off % 7 > 4 or v_off / 7 + 1 > coalesce(v_cfg.weeks, 0);
    insert into itqan.attendance_writeback (student_id, day, kind, sheet, raw_name, week, dow, value)
    values (u.id, p_day, v_kind, v_sn.sheet, v_sn.raw_name, v_off / 7 + 1, v_off % 7, true);
  end loop;
  return v_n;
end $$;
revoke all on function itqan.live_day_compute(text, date) from public, anon, authenticated;

-- الحساب التلقائي: بعد اعتماد كل حصص الفصل في اليوم، أو بعد ساعتين من انتهاء آخر حصة
create or replace function itqan.live_day_finalize()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select x.class_id, x.day
      from (select distinct c.cid as class_id, (s.starts_at at time zone 'Asia/Riyadh')::date as day
              from public.live_sessions s cross join lateral jsonb_array_elements_text(s.class_ids) c(cid)
             where s.starts_at > now() - interval '3 days' and s.starts_at < now() and s.status <> 'cancelled') x
     where not exists (select 1 from itqan.live_day_final f where f.class_id = x.class_id and f.day = x.day)
       and not exists (select 1 from public.live_sessions s
                        where s.class_ids ? x.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = x.day
                          and itqan.live_state(s) in ('scheduled', 'live'))
       and exists (select 1 from public.live_sessions s
                    where s.class_ids ? x.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = x.day
                      and itqan.live_state(s) = 'ended')
       and (
         -- اعتمد المعلمون كل الحصص
         not exists (select 1 from public.live_sessions s
                      where s.class_ids ? x.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = x.day
                        and itqan.live_state(s) = 'ended' and s.att_submitted_at is null)
         -- أو مرّت ساعتان على انتهاء آخر حصة
         or (select max(least(s.starts_at + make_interval(mins => s.duration_min), coalesce(s.ended_at, s.starts_at + make_interval(mins => s.duration_min))))
               from public.live_sessions s
              where s.class_ids ? x.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = x.day
                and itqan.live_state(s) = 'ended') < now() - interval '2 hours')
  loop
    v_n := v_n + itqan.live_day_compute(r.class_id, r.day);
  end loop;
  delete from itqan.live_day_final where day < (now() at time zone 'Asia/Riyadh')::date - 30;
  delete from itqan.attendance_writeback where done_at < now() - interval '30 days';
  return v_n;
end $$;
revoke all on function itqan.live_day_finalize() from public, anon, authenticated;

-- المعلم يعدّل الحالات ويعتمد: p_marks = {"user_id": "present|late|absent|excused|null"}
create or replace function public.itqan_live_attendance_set(p_id text, p_marks jsonb, p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.live_sessions; k text; v text; v_uid text := itqan.uid(); v_cls text;
  v_day date; v_n int := 0;
begin
  select * into s from public.live_sessions where id = p_id for update;
  if s.id is null or not itqan.live_owner(s) then raise exception 'forbidden'; end if;
  if itqan.live_state(s) <> 'ended' then raise exception 'not_ended'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_marks, '{}'::jsonb)) loop
    continue when v is not null and v not in ('present', 'late', 'absent', 'excused');
    -- طالب من فصول الحصة فقط
    continue when not exists (select 1 from public.users u where u.id::text = k and u.role::text = 'student' and s.class_ids ? u.class_id);
    insert into public.live_attendance (session_id, user_id, first_join, last_seen, seconds, joins, override, override_by)
    values (s.id, k, now(), now(), 0, 0, v, v_uid)
    on conflict (session_id, user_id) do update set override = excluded.override, override_by = excluded.override_by;
    v_n := v_n + 1;
  end loop;
  if p_submit then
    update public.live_sessions set att_submitted_at = now(), att_submitted_by = v_uid where id = s.id returning * into s;
    v_day := (s.starts_at at time zone 'Asia/Riyadh')::date;
    -- كل حصص الفصل في اليوم معتمدة (أو سبق حساب اليوم) ← يُحسب السجل الآن
    for v_cls in select jsonb_array_elements_text(s.class_ids) loop
      if exists (select 1 from itqan.live_day_final f where f.class_id = v_cls and f.day = v_day)
         or (not exists (select 1 from public.live_sessions x
                          where x.class_ids ? v_cls and (x.starts_at at time zone 'Asia/Riyadh')::date = v_day
                            and itqan.live_state(x) in ('scheduled', 'live'))
             and not exists (select 1 from public.live_sessions x
                              where x.class_ids ? v_cls and (x.starts_at at time zone 'Asia/Riyadh')::date = v_day
                                and itqan.live_state(x) = 'ended' and x.att_submitted_at is null)) then
        perform itqan.live_day_compute(v_cls, v_day);
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'changed', v_n, 'submitted_at', s.att_submitted_at);
end $$;

-- Apps Script: الحركات المنتظرة مع قيمة الخانة (true تعليم / false إزالة)
create or replace function public.itqan_attendance_writeback(p_token text, p_done bigint[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  if coalesce(p_token, '') = '' or v_cfg.token_hash is null or itqan.hash_token(p_token) <> v_cfg.token_hash then
    raise exception 'invalid_token';
  end if;
  if p_done is not null then
    update itqan.attendance_writeback set done_at = now() where id = any(p_done) and done_at is null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', w.id, 'sheet', w.sheet, 'name', w.raw_name, 'week', w.week, 'dow', w.dow,
                                        'kind', w.kind, 'value', w.value) order by w.id)
      from (select * from itqan.attendance_writeback where done_at is null order by id limit 300) w), '[]'::jsonb);
end $$;

revoke all on function public.itqan_live_attendance_set(text, jsonb, boolean) from public;
grant execute on function public.itqan_live_attendance_set(text, jsonb, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 090: مراجعة المعلم للحضور واعتماده، وتصحيح السجل والشيت' as result;
