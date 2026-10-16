-- =====================================================================
-- منصة إتقان: 085 — الحصص المباشرة: تغيير العنوان أثناء الحصة، ورابط اجتماع خارجي
--  - itqan_live_set يقبل عنواناً جديداً (المعلم من شاشة الحصة)، والنبضة تعيده للطلاب.
--  - رابط اجتماع خارجي اختياري (Zoom/Teams/Meet): الطالب يدخل من المنصة، فيبقى الجدول
--    والتذكير والحضور، ويُفتح الاجتماع في تطبيقه. الرابط لا يظهر للطالب إلا عند الدخول.
--
-- يتطلب 083 و084. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.live_sessions add column if not exists external_url text;

create or replace function itqan.live_row(s public.live_sessions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'series_id', s.series_id, 'class_ids', s.class_ids, 'subject_id', s.subject_id,
    'teacher_id', s.teacher_id, 'teacher_name', s.teacher_name, 'title', s.title, 'notes', s.notes,
    'starts_at', s.starts_at, 'duration_min', s.duration_min, 'period', s.period, 'status', itqan.live_state(s),
    'started_at', s.started_at, 'ended_at', s.ended_at, 'chat_locked', s.chat_locked,
    'can_manage', itqan.live_owner(s),
    'external', s.external_url is not null,
    'external_url', case when itqan.live_owner(s) then s.external_url end,
    'attended', (select jsonb_build_object('seconds', a.seconds, 'first_join', a.first_join)
                   from public.live_attendance a where a.session_id = s.id and a.user_id = itqan.uid()));
$$;

create or replace function public.itqan_live_save(p jsonb, p_repeat_until date default null, p_weekdays int[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := itqan.uid();
  v_me public.users;
  v_classes jsonb := coalesce(p -> 'class_ids', '[]'::jsonb);
  v_start timestamptz := (p ->> 'starts_at')::timestamptz;
  v_dur int := coalesce(nullif(p ->> 'duration_min', '')::int, 35);
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_series text;
  v_local timestamp; v_day date; v_end date; v_days int[]; v_n int := 0;
  c text; s public.live_sessions;
  v_ext text := nullif(btrim(coalesce(p ->> 'external_url', '')), '');
begin
  if v_ext is not null and (v_ext !~* '^https://' or length(v_ext) > 1000) then raise exception 'bad_url'; end if;
  select * into v_me from public.users where id::text = v_uid;
  if v_me.id is null or v_me.role::text not in ('admin', 'teacher', 'supervisor') then raise exception 'forbidden'; end if;
  if v_title = '' then raise exception 'title_required'; end if;
  if jsonb_typeof(v_classes) <> 'array' or jsonb_array_length(v_classes) = 0 then raise exception 'class_required'; end if;
  for c in select jsonb_array_elements_text(v_classes) loop
    if not itqan.live_can_manage_class(c) then raise exception 'class_forbidden'; end if;
  end loop;
  if v_start is null then raise exception 'start_required'; end if;

  -- تعديل حصة واحدة
  if nullif(p ->> 'id', '') is not null then
    select * into s from public.live_sessions where id = p ->> 'id';
    if s.id is null then raise exception 'not_found'; end if;
    if not itqan.live_owner(s) then raise exception 'forbidden'; end if;
    update public.live_sessions set
      title = v_title, notes = coalesce(p ->> 'notes', ''), class_ids = v_classes,
      subject_id = nullif(p ->> 'subject_id', ''), starts_at = v_start, duration_min = v_dur,
      period = nullif(p ->> 'period', '')::int,
      external_url = v_ext,
      reminded = case when starts_at <> v_start then false else reminded end,
      start_notified = case when starts_at <> v_start then false else start_notified end
     where id = s.id returning * into s;
    return itqan.live_row(s);
  end if;

  if p_repeat_until is not null and p_repeat_until > (v_start at time zone 'Asia/Riyadh')::date + 200 then raise exception 'repeat_too_long'; end if;
  v_series := case when p_repeat_until is not null or coalesce(array_length(p_weekdays, 1), 0) > 0
                   then 'lvs-' || encode(extensions.gen_random_bytes(6), 'hex') end;
  -- المدير والمشرف يجدولان باسم معلم آخر؛ المعلم يجدول لنفسه فقط
  if nullif(p ->> 'teacher_id', '') is not null and p ->> 'teacher_id' <> v_uid
     and (itqan.is_admin() or itqan.my_role() = 'supervisor') then
    select * into v_me from public.users where id::text = p ->> 'teacher_id' and role::text in ('admin', 'teacher', 'supervisor');
    if v_me.id is null then raise exception 'teacher_not_found'; end if;
  end if;
  v_local := v_start at time zone 'Asia/Riyadh';
  v_end := coalesce(p_repeat_until, v_local::date + 6);
  v_days := coalesce(p_weekdays, '{}'::int[]) || extract(dow from v_local)::int;
  if p_repeat_until is null and coalesce(array_length(p_weekdays, 1), 0) = 0 then v_end := v_local::date; end if;
  v_day := v_local::date;
  while v_day <= v_end loop
    if extract(dow from v_day)::int = any(v_days) then
      insert into public.live_sessions (series_id, branch_id, class_ids, subject_id, teacher_id, teacher_name, title, notes,
                                        starts_at, duration_min, period, external_url, created_by)
      values (v_series, nullif(v_me.branch_id, ''), v_classes, nullif(p ->> 'subject_id', ''),
              v_me.id::text, coalesce(v_me.name, ''),
              v_title, coalesce(p ->> 'notes', ''),
              (v_day + v_local::time) at time zone 'Asia/Riyadh', v_dur, nullif(p ->> 'period', '')::int, v_ext, v_uid);
      v_n := v_n + 1;
      if v_n > 120 then raise exception 'repeat_too_long'; end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return jsonb_build_object('ok', true, 'created', v_n, 'series_id', v_series);
end $$;

create or replace function public.itqan_live_join(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.live_sessions;
  v_uid text := itqan.uid();
  v_me public.users;
  v_mod boolean;
  v_state text;
  v_domain text := nullif(btrim(coalesce((select value ->> 'domain' from public.app_settings where key = 'live_classes'), '')), '');
  v_cfg itqan.live_config;
  v_jwt text;
  v_students jsonb;
  v_was_notified boolean;
  v_name text;
begin
  select * into s from public.live_sessions where id = p_id for update;
  if s.id is null or not itqan.live_visible(s) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_me from public.users where id::text = v_uid;
  if v_me.role::text = 'parent' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_domain is null and s.external_url is null then return jsonb_build_object('ok', false, 'error', 'not_configured'); end if;
  v_mod := itqan.live_owner(s);
  v_was_notified := s.start_notified;
  -- اسم الطالب في الحصة: الاسم الأول والثاني والأخير (078)
  v_name := case when v_me.role::text = 'student' then itqan.honor_name(v_me.name) else coalesce(v_me.name, '') end;
  v_state := itqan.live_state(s);
  if v_state = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'cancelled'); end if;

  -- الحصة تُغلق تلقائياً بانتهاء وقتها (للجميع)
  if v_state in ('ended', 'missed') then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
  if v_mod then
    if s.status <> 'live' then
      update public.live_sessions set status = 'live', started_at = coalesce(started_at, now()), ended_at = null,
             start_notified = true where id = s.id returning * into s;
      -- إشعار الطلاب ببدء الحصة
      if v_was_notified then v_students := '[]'::jsonb; else
      select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_students
        from public.users u where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id;
      end if;
      if jsonb_array_length(v_students) > 0 then
        begin
          insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
          values ('ntf-lvs-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
                  'بدأت الحصة المباشرة الآن: ' || s.title,
                  coalesce(nullif(s.teacher_name, ''), 'المعلم') || E'\nاضغط للدخول إلى الحصة',
                  jsonb_build_object('student_ids', v_students), 'live', s.id, v_uid, v_me.name);
        exception when others then null;
        end;
      end if;
    end if;
  elsif v_state <> 'live' then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;

  insert into public.live_attendance (session_id, user_id) values (s.id, v_uid)
    on conflict (session_id, user_id) do update set joins = public.live_attendance.joins + 1, last_seen = now();

  -- اجتماع خارجي (Zoom/Teams/Meet): يُسجَّل الحضور بالضغط ويُعاد الرابط فقط
  if s.external_url is not null then
    return jsonb_build_object('ok', true, 'external_url', s.external_url, 'moderator', v_mod, 'name', v_name, 'session', itqan.live_row(s));
  end if;

  select * into v_cfg from itqan.live_config where id = 1;
  if coalesce(v_cfg.secret, '') <> '' then
    v_jwt := itqan.live_jwt(jsonb_build_object(
      'aud', 'jitsi', 'iss', v_cfg.app_id, 'sub', v_domain, 'room', s.room,
      'nbf', extract(epoch from now())::bigint - 60,
      'exp', extract(epoch from s.starts_at + make_interval(mins => s.duration_min + 15))::bigint,
      'moderator', v_mod,
      'context', jsonb_build_object('user', jsonb_build_object(
        'id', v_uid, 'name', v_name, 'moderator', v_mod,
        'affiliation', case when v_mod then 'owner' else 'member' end))), v_cfg.secret);
  end if;

  return jsonb_build_object('ok', true, 'domain', v_domain, 'room', s.room, 'jwt', v_jwt,
    'moderator', v_mod, 'name', v_name, 'session', itqan.live_row(s));
end $$;

drop function if exists public.itqan_live_set(text, text, boolean);
create or replace function public.itqan_live_set(p_id text, p_status text default null, p_chat_locked boolean default null, p_title text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null then raise exception 'not_found'; end if;
  if not itqan.live_owner(s) then raise exception 'forbidden'; end if;
  if p_status is not null and p_status not in ('scheduled', 'ended', 'cancelled') then raise exception 'bad_status'; end if;
  if v_title is not null and length(v_title) > 200 then raise exception 'title_too_long'; end if;
  update public.live_sessions set
    status = coalesce(p_status, status),
    ended_at = case when p_status = 'ended' then now() when p_status = 'scheduled' then null else ended_at end,
    started_at = case when p_status = 'scheduled' then null else started_at end,
    chat_locked = coalesce(p_chat_locked, chat_locked),
    title = coalesce(v_title, title)
   where id = p_id returning * into s;
  return itqan.live_row(s);
end $$;
revoke all on function public.itqan_live_set(text, text, boolean, text) from public;
grant execute on function public.itqan_live_set(text, text, boolean, text) to anon, authenticated;

create or replace function public.itqan_live_ping(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; a public.live_attendance;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null then return jsonb_build_object('ok', false); end if;
  update public.live_attendance
     set seconds = seconds + least(greatest(extract(epoch from now() - last_seen)::int, 0), 90), last_seen = now()
   where session_id = p_id and user_id = itqan.uid() returning * into a;
  return jsonb_build_object('ok', a.session_id is not null, 'status', itqan.live_state(s), 'chat_locked', s.chat_locked, 'title', s.title);
end $$;

notify pgrst, 'reload schema';

select '✓ تم تحديث 085: عنوان الحصة أثناءها، ورابط اجتماع خارجي (Zoom/Teams/Meet)' as result;
