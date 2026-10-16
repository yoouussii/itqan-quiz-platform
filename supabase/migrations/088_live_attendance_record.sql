-- =====================================================================
-- 088: حضور الحصص المباشرة وربطه بسجل الغياب (وشيت جوجل)
--  حالة الطالب في كل حصة بعد انتهائها:
--   - حاضر: حضر نصف مدة الحصة الفعلية أو أكثر، ودخل خلال أول 10 دقائق.
--   - متأخر: حضر نصف المدة أو أكثر، لكنه دخل بعد أكثر من 10 دقائق من بدايتها.
--   - غائب: لم يدخل، أو حضر أقل من نصف المدة.
--   (الاجتماع الخارجي Teams/Meet لا تُقاس مدته: يكفي الدخول من المنصة، مع حساب التأخر)
--  سجل الغياب (على مستوى اليوم) بعد انتهاء آخر حصة للفصل في ذلك اليوم:
--   - غاب عن كل حصص اليوم ← «غياب».
--   - غير ذلك، ولم يكن «حاضراً» في أول حصة ← «تأخر».
--   - يُسجَّل بمصدر «الحصص المباشرة»، ولا يُعاد إن حذفه المسؤول، ولا يُسجَّل إن كان للطالب «استئذان» ذلك اليوم.
--  الكتابة في شيت جوجل: كود Apps Script الجديد يسحب هذه الحركات ويضع علامتها في خانة اليوم.
--  يتطلب 022–029 و083–087. آمن لإعادة التشغيل.
-- =====================================================================

-- مصدر جديد للحركة: live (من الحصص المباشرة)
alter table public.attendance_records drop constraint if exists attendance_records_source_check;
alter table public.attendance_records add constraint attendance_records_source_check check (source in ('sheet', 'manual', 'live'));

-- اسم كل طالب كما يظهر في شيت الغياب (يُحدَّث مع كل مزامنة)
create table if not exists itqan.attendance_sheet_names (
  student_id text primary key,
  sheet      text not null,
  raw_name   text not null,
  updated_at timestamptz not null default now()
);
-- أيام الفصول التي حُسب حضورها (حتى لا يُعاد تسجيل ما حذفه المسؤول)
create table if not exists itqan.live_day_final (
  class_id text not null,
  day      date not null,
  at       timestamptz not null default now(),
  primary key (class_id, day)
);
-- حركات تنتظر كتابتها في شيت جوجل
create table if not exists itqan.attendance_writeback (
  id         bigserial primary key,
  student_id text not null,
  day        date not null,
  kind       text not null,
  sheet      text not null,
  raw_name   text not null,
  week       int not null,
  dow        int not null,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists attendance_writeback_pending_idx on itqan.attendance_writeback (id) where done_at is null;

-- حالة الطالب في حصة (null قبل انتهائها أو إن لم تُعقد)
create or replace function itqan.live_att_status(s public.live_sessions, a public.live_attendance)
returns text language sql stable set search_path = '' as $$
  with w as (
    select greatest(s.starts_at, coalesce(s.started_at, s.starts_at)) as st,
           least(s.starts_at + make_interval(mins => s.duration_min),
                 coalesce(s.ended_at, s.starts_at + make_interval(mins => s.duration_min))) as en)
  select case
    when itqan.live_state(s) <> 'ended' then null
    when a.session_id is null then 'absent'
    when s.external_url is not null then
      case when a.first_join > w.st + interval '10 minutes' then 'late' else 'present' end
    when a.seconds * 2 < greatest(extract(epoch from w.en - w.st), 60) then 'absent'
    when a.first_join > w.st + interval '10 minutes' then 'late'
    else 'present' end
  from w;
$$;

-- كشف حضور الحصة: مع الحالة
create or replace function public.itqan_live_attendance(p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null or not itqan.is_staff() or not itqan.live_visible(s) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'class_id', u.class_id,
             'first_join', a.first_join, 'last_seen', a.last_seen, 'seconds', coalesce(a.seconds, 0), 'joins', coalesce(a.joins, 0),
             'status', itqan.live_att_status(s, a))
             order by (a.user_id is null), u.name)
      from public.users u
      left join public.live_attendance a on a.session_id = s.id and a.user_id = u.id::text
     where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id), '[]'::jsonb);
end $$;

-- حضور اليوم ← سجل الغياب، لكل فصل انتهت كل حصصه المباشرة في ذلك اليوم
create or replace function itqan.live_day_finalize()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record; u record; v_cfg itqan.attendance_config;
  v_all_absent boolean; v_first text; v_title text; v_kind text; v_id bigint; v_off int; v_sn itqan.attendance_sheet_names;
  v_n int := 0;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  for r in
    select x.class_id, x.day
      from (select distinct c.cid as class_id, (s.starts_at at time zone 'Asia/Riyadh')::date as day
              from public.live_sessions s cross join lateral jsonb_array_elements_text(s.class_ids) c(cid)
             where s.starts_at > now() - interval '3 days' and s.starts_at < now() and s.status <> 'cancelled') x
     where not exists (select 1 from itqan.live_day_final f where f.class_id = x.class_id and f.day = x.day)
       -- لم يبقَ للفصل حصة مجدولة أو جارية ذلك اليوم، وعُقدت حصة واحدة على الأقل
       and not exists (select 1 from public.live_sessions s
                        where s.class_ids ? x.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = x.day
                          and itqan.live_state(s) in ('scheduled', 'live'))
       and exists (select 1 from public.live_sessions s
                    where s.class_ids ? x.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = x.day
                      and itqan.live_state(s) = 'ended')
  loop
    insert into itqan.live_day_final (class_id, day) values (r.class_id, r.day) on conflict do nothing;
    for u in select id::text as id from public.users where role::text = 'student' and class_id = r.class_id loop
      select bool_and(t.st = 'absent'),
             (array_agg(t.st order by t.at))[1],
             (array_agg(t.title order by t.at))[1]
        into v_all_absent, v_first, v_title
        from (select itqan.live_att_status(s, a) as st, s.title,
                     greatest(s.starts_at, coalesce(s.started_at, s.starts_at)) as at
                from public.live_sessions s
                left join public.live_attendance a on a.session_id = s.id and a.user_id = u.id
               where s.class_ids ? r.class_id and (s.starts_at at time zone 'Asia/Riyadh')::date = r.day
                 and itqan.live_state(s) = 'ended') t;
      v_kind := case when v_all_absent then 'absent' when v_first is distinct from 'present' then 'late' end;
      continue when v_kind is null;
      -- استئذان مسجّل لذلك اليوم: لا غياب ولا تأخر
      continue when exists (select 1 from public.attendance_records x where x.student_id = u.id and x.day = r.day and x.kind = 'excused');
      v_id := null;
      insert into public.attendance_records (student_id, day, kind, source, note, created_by)
      values (u.id, r.day, v_kind, 'live',
              case when v_kind = 'late' then 'الحصص المباشرة: ' || coalesce(v_title, '') else 'الحصص المباشرة' end, 'live')
      on conflict (student_id, day, kind) do nothing
      returning id into v_id;
      continue when v_id is null;
      v_n := v_n + 1;
      -- للكتابة في شيت جوجل: خانة (الأسبوع، اليوم) من تاريخ بداية الفصل
      select * into v_sn from itqan.attendance_sheet_names where student_id = u.id;
      continue when v_sn.student_id is null or v_cfg.start_date is null;
      v_off := r.day - v_cfg.start_date;
      continue when v_off < 0 or v_off % 7 > 4 or v_off / 7 + 1 > coalesce(v_cfg.weeks, 0);
      insert into itqan.attendance_writeback (student_id, day, kind, sheet, raw_name, week, dow)
      values (u.id, r.day, v_kind, v_sn.sheet, v_sn.raw_name, v_off / 7 + 1, v_off % 7);
    end loop;
  end loop;
  delete from itqan.live_day_final where day < (now() at time zone 'Asia/Riyadh')::date - 30;
  delete from itqan.attendance_writeback where done_at < now() - interval '30 days';
  return v_n;
end $$;
revoke all on function itqan.live_day_finalize() from public, anon, authenticated;

-- Apps Script: يسحب الحركات المنتظرة، ويؤكد ما كتبه (p_done)
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
    select jsonb_agg(jsonb_build_object('id', w.id, 'sheet', w.sheet, 'name', w.raw_name, 'week', w.week, 'dow', w.dow, 'kind', w.kind) order by w.id)
      from (select * from itqan.attendance_writeback where done_at is null order by id limit 300) w), '[]'::jsonb);
end $$;
revoke all on function public.itqan_attendance_writeback(text, bigint[]) from public;
grant execute on function public.itqan_attendance_writeback(text, bigint[]) to anon, authenticated;

create or replace function public.itqan_attendance_import(p_payload jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.attendance_config;
  v_source text; v_by text := '';
  s jsonb; st jsonb; v_sheet text; v_class text; v_id text; v_roster boolean; v_seen text[]; v_n int; v_bad int;
  v_matched int := 0; v_marks int := 0; v_unmatched jsonb := '[]'::jsonb; v_sheets int := 0; v_roster_n int := 0;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  if p_token is not null and p_token <> '' then
    if v_cfg.token_hash is null or itqan.hash_token(p_token) <> v_cfg.token_hash then
      raise exception 'invalid_token';
    end if;
    v_source := 'sheet_sync';
  else
    if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
    v_source := 'upload';
    select coalesce(u.name, '') into v_by from public.users u where u.id::text = itqan.uid();
  end if;
  if v_cfg.start_date is null then raise exception 'no_start_date'; end if;
  if jsonb_typeof(p_payload -> 'sheets') <> 'array' then raise exception 'bad_payload'; end if;

  for s in select * from jsonb_array_elements(p_payload -> 'sheets') loop
    v_sheets := v_sheets + 1;
    v_sheet := btrim(s ->> 'sheet');
    v_class := nullif(v_cfg.sheet_classes ->> v_sheet, '');
    v_roster := v_class = '__roster__';
    if v_roster then v_class := null; end if;
    v_seen := '{}'; v_n := 0; v_bad := 0;
    delete from itqan.attendance_unmatched u where u.sheet = v_sheet;

    for st in select * from jsonb_array_elements(coalesce(s -> 'students', '[]'::jsonb)) loop
      continue when itqan.norm_name(st ->> 'name') = '';
      v_n := v_n + 1;
      if v_roster then
        insert into public.attendance_roster (sheet, name, name_norm)
        values (v_sheet, btrim(st ->> 'name'), itqan.norm_name(st ->> 'name'))
        on conflict (sheet, name_norm) do update set name = excluded.name
        returning id into v_id;
        v_seen := v_seen || v_id;
        v_roster_n := v_roster_n + 1;
      else
        v_id := itqan.attendance_resolve(st ->> 'name', v_class);
        -- اسم متجاهَل: لا يُسجَّل ولا يظهر في «لم تُطابق»
        continue when v_id = '__ignore__';
        -- اسم رُبط بطالب «بدون حساب» من هذا الشيت: يبقى في القائمة
        if v_id like 'R-%' then v_seen := v_seen || v_id; end if;
      end if;

      if v_id is null then
        insert into itqan.attendance_unmatched (sheet, name_norm, raw_name, marks)
        values (v_sheet, itqan.norm_name(st ->> 'name'), btrim(st ->> 'name'), coalesce(st -> 'marks', '[]'::jsonb))
        on conflict (sheet, name_norm) do update set marks = excluded.marks, raw_name = excluded.raw_name;
        v_unmatched := v_unmatched || jsonb_build_object('sheet', v_sheet, 'name', btrim(st ->> 'name'));
        v_bad := v_bad + 1;
      else
        v_matched := v_matched + 1;
        v_marks := v_marks + itqan.attendance_apply(v_id, st -> 'marks', v_cfg.start_date, v_cfg.weeks);
        -- 088: اسم الطالب كما في الشيت (لكتابة غياب الحصص المباشرة في صفّه الصحيح)
        if not v_roster and v_id not like 'R-%' then
          insert into itqan.attendance_sheet_names (student_id, sheet, raw_name, updated_at)
          values (v_id, v_sheet, btrim(st ->> 'name'), now())
          on conflict (student_id) do update set sheet = excluded.sheet, raw_name = excluded.raw_name, updated_at = now();
        end if;
      end if;
    end loop;

    -- من لم يعد في الشيت (أو تحوّل الشيت لطلاب المنصة): تُحذف حركاته من الشيت، ويُحذف من القائمة إن لم تكن له حركات يدوية
    delete from public.attendance_records r
    using public.attendance_roster ro
    where ro.sheet = v_sheet and not (ro.id = any(v_seen)) and r.student_id = ro.id and r.source = 'sheet';
    delete from public.attendance_roster ro
    where ro.sheet = v_sheet and not (ro.id = any(v_seen))
      and not exists (select 1 from public.attendance_records r where r.student_id = ro.id);

    -- آخر ما وصل من هذا الشيت (لعرض كل الشيتات في صفحة الربط)
    update itqan.attendance_config
    set seen_sheets = coalesce(seen_sheets, '{}'::jsonb) || jsonb_build_object(v_sheet, jsonb_build_object('students', v_n, 'unmatched', v_bad, 'at', now()))
    where id = 1;
  end loop;

  insert into itqan.attendance_sync_log (source, by_name, summary)
  values (v_source, v_by, jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks,
          'unmatched', jsonb_array_length(v_unmatched), 'roster', v_roster_n));
  delete from itqan.attendance_sync_log where id not in (select id from itqan.attendance_sync_log order by id desc limit 50);

  return jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks, 'unmatched', v_unmatched, 'roster', v_roster_n);
end $$;

revoke all on function public.itqan_attendance_import(jsonb, text) from public;
grant execute on function public.itqan_attendance_import(jsonb, text) to anon, authenticated;

create or replace function itqan.live_tick()
returns text language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; v_students jsonb; n int := 0; m int := 0;
begin
  -- إغلاق تلقائي بانتهاء وقت الحصة
  update public.live_sessions x set status = 'ended', ended_at = now()
   where x.status in ('live', 'scheduled') and now() >= x.starts_at + make_interval(mins => x.duration_min)
     and (x.status = 'live' or x.started_at is not null
          or exists (select 1 from public.live_attendance a where a.session_id = x.id));
  -- تذكير قبل الحصة
  for s in select * from public.live_sessions
            where status = 'scheduled' and not reminded
              and starts_at > now() and starts_at <= now() + interval '16 minutes' for update skip locked loop
    update public.live_sessions set reminded = true where id = s.id;
    select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_students
      from public.users u where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id;
    begin
      insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
      values ('ntf-lvr-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
              'حصة مباشرة بعد قليل: ' || s.title,
              coalesce(nullif(s.teacher_name, ''), 'المعلم') || E'\nالموعد: ' || to_char(s.starts_at at time zone 'Asia/Riyadh', 'HH24:MI'),
              jsonb_build_object('student_ids', v_students, 'user_ids', jsonb_build_array(s.teacher_id)),
              'live', s.id, null, 'منصة إتقان');
    exception when others then null;
    end;
    n := n + 1;
  end loop;
  -- فتح تلقائي: إشعار «بدأت الحصة» عند حلول موعدها
  for s in select * from public.live_sessions
            where status in ('scheduled', 'live') and not start_notified
              and starts_at <= now() and now() < starts_at + make_interval(mins => duration_min) for update skip locked loop
    update public.live_sessions set start_notified = true where id = s.id;
    select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_students
      from public.users u where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id;
    begin
      insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
      values ('ntf-lvs-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
              'بدأت الحصة المباشرة الآن: ' || s.title,
              coalesce(nullif(s.teacher_name, ''), 'المعلم') || E'\nاضغط للدخول إلى الحصة',
              jsonb_build_object('student_ids', v_students, 'user_ids', jsonb_build_array(s.teacher_id)),
              'live', s.id, null, 'منصة إتقان');
    exception when others then null;
    end;
    m := m + 1;
  end loop;
  -- 088: حضور اليوم في سجل الغياب بعد انتهاء آخر حصة للفصل
  begin m := m + itqan.live_day_finalize(); exception when others then null; end;
  return case when n + m > 0 then 'live:' || n || '/' || m end;
end $$;
revoke all on function itqan.live_tick() from public, anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 088: حضور الحصص المباشرة (حاضر/متأخر/غائب) وربطه بسجل الغياب وشيت جوجل' as result;
