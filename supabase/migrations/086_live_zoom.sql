-- =====================================================================
-- منصة إتقان: 086 — الحصص المباشرة: Zoom داخل المنصة (Meeting SDK)
--  - كل معلم يضيف مفاتيح تطبيق Meeting SDK من حسابه في Zoom (المجاني) مرة واحدة،
--    فتكون اجتماعاته داخل حساب التطبيق نفسه.
--  - الحصة تحمل رقم اجتماع Zoom ورمزه (لا يظهران للطالب)، والطالب يدخل من المنصة
--    بتوقيع يُنشئه الخادم فيُعرض الاجتماع داخل الصفحة باسمه الثلاثي، والمعلم يبدأ من تطبيق Zoom.
--  - السرّ لا يغادر الخادم ولا يُعاد أبداً.
--
-- يتطلب 083 و084 و085. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.live_sessions add column if not exists zoom_meeting text;
alter table public.live_sessions add column if not exists zoom_passcode text;

create table if not exists itqan.zoom_keys (
  user_id       text primary key,
  client_id     text not null default '',
  client_secret text not null default '',
  updated_at    timestamptz not null default now()
);
revoke all on itqan.zoom_keys from public, anon, authenticated;

-- مفاتيح Zoom للمعلم الحالي (لا يُعاد السرّ أبداً؛ null = إبقاء السرّ الحالي، '' للحذف)
create or replace function public.itqan_zoom_keys_set(p_client_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid();
begin
  if not coalesce(itqan.is_staff(), false) then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_client_id), '') = '' then
    delete from itqan.zoom_keys where user_id = v_uid;
    return public.itqan_zoom_keys_status();
  end if;
  if length(btrim(p_client_id)) > 200 or length(coalesce(p_secret, '')) > 200 then raise exception 'too_long'; end if;
  insert into itqan.zoom_keys (user_id, client_id, client_secret, updated_at)
  values (v_uid, btrim(p_client_id), coalesce(btrim(p_secret), ''), now())
  on conflict (user_id) do update set client_id = excluded.client_id,
    client_secret = case when p_secret is null then itqan.zoom_keys.client_secret else excluded.client_secret end,
    updated_at = now();
  return public.itqan_zoom_keys_status();
end $$;

create or replace function public.itqan_zoom_keys_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'configured', coalesce((select client_id <> '' and client_secret <> '' from itqan.zoom_keys where user_id = itqan.uid()), false),
    'client_id', (select client_id from itqan.zoom_keys where user_id = itqan.uid()));
$$;

revoke all on function public.itqan_zoom_keys_set(text, text), public.itqan_zoom_keys_status() from public;
grant execute on function public.itqan_zoom_keys_set(text, text), public.itqan_zoom_keys_status() to anon, authenticated;

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
  v_zm text := nullif(regexp_replace(coalesce(p ->> 'zoom_meeting', ''), '[^0-9]', '', 'g'), '');
  v_zp text := nullif(btrim(coalesce(p ->> 'zoom_passcode', '')), '');
begin
  if v_zm is not null and length(v_zm) not between 9 and 12 then raise exception 'bad_zoom_meeting'; end if;
  if v_zp is not null and length(v_zp) > 32 then raise exception 'bad_zoom_passcode'; end if;
  if v_zm is not null then v_ext := null; else v_zp := null; end if;
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
      external_url = v_ext, zoom_meeting = v_zm, zoom_passcode = v_zp,
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
  if v_zm is not null and not exists (select 1 from itqan.zoom_keys k where k.user_id = v_me.id::text and k.client_secret <> '') then
    raise exception 'zoom_keys_missing';
  end if;
  v_local := v_start at time zone 'Asia/Riyadh';
  v_end := coalesce(p_repeat_until, v_local::date + 6);
  v_days := coalesce(p_weekdays, '{}'::int[]) || extract(dow from v_local)::int;
  if p_repeat_until is null and coalesce(array_length(p_weekdays, 1), 0) = 0 then v_end := v_local::date; end if;
  v_day := v_local::date;
  while v_day <= v_end loop
    if extract(dow from v_day)::int = any(v_days) then
      insert into public.live_sessions (series_id, branch_id, class_ids, subject_id, teacher_id, teacher_name, title, notes,
                                        starts_at, duration_min, period, external_url, zoom_meeting, zoom_passcode, created_by)
      values (v_series, nullif(v_me.branch_id, ''), v_classes, nullif(p ->> 'subject_id', ''),
              v_me.id::text, coalesce(v_me.name, ''),
              v_title, coalesce(p ->> 'notes', ''),
              (v_day + v_local::time) at time zone 'Asia/Riyadh', v_dur, nullif(p ->> 'period', '')::int, v_ext, v_zm, v_zp, v_uid);
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
  v_zk itqan.zoom_keys;
begin
  select * into s from public.live_sessions where id = p_id for update;
  if s.id is null or not itqan.live_visible(s) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_me from public.users where id::text = v_uid;
  if v_me.role::text = 'parent' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_domain is null and s.external_url is null and s.zoom_meeting is null then return jsonb_build_object('ok', false, 'error', 'not_configured'); end if;
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

  -- Zoom داخل المنصة: الطالب يحصل على توقيع Meeting SDK بمفاتيح معلم الحصة؛ المعلم يبدأ من تطبيق Zoom
  if s.zoom_meeting is not null then
    if v_mod then
      return jsonb_build_object('ok', true, 'external_url', 'https://zoom.us/j/' || s.zoom_meeting, 'moderator', true, 'name', v_name, 'session', itqan.live_row(s));
    end if;
    select * into v_zk from itqan.zoom_keys where user_id = s.teacher_id and client_secret <> '';
    if v_zk.user_id is null then return jsonb_build_object('ok', false, 'error', 'zoom_not_configured'); end if;
    return jsonb_build_object('ok', true, 'moderator', false, 'name', v_name, 'session', itqan.live_row(s),
      'zoom', jsonb_build_object(
        'meetingNumber', s.zoom_meeting, 'password', coalesce(s.zoom_passcode, ''), 'userName', v_name,
        'signature', itqan.live_jwt(jsonb_build_object(
          'appKey', v_zk.client_id, 'sdkKey', v_zk.client_id, 'mn', s.zoom_meeting, 'role', 0,
          'iat', extract(epoch from now())::bigint - 30,
          'exp', extract(epoch from now())::bigint + 7200,
          'tokenExp', extract(epoch from now())::bigint + 7200,
          'video_webrtc_mode', 1), v_zk.client_secret)));
  end if;

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

notify pgrst, 'reload schema';

select '✓ تم تحديث 086: Zoom داخل المنصة (Meeting SDK) بمفاتيح كل معلم' as result;
