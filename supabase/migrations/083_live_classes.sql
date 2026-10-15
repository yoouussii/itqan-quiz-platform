-- =====================================================================
-- منصة إتقان: 083 — الحصص المباشرة (Jitsi على خادم المدرسة)
--  - المعلم يجدول حصة لفصل أو أكثر (مرة واحدة أو أسبوعياً حتى تاريخ معيّن).
--  - يصل الطلاب تذكير قبل الحصة (~15 دقيقة) وإشعار عند بدئها.
--  - الطالب لا يدخل إلا بعد أن يبدأ المعلم الحصة، فيكون المعلم أول الداخلين ومشرف الغرفة.
--  - رمز دخول (JWT) يوقّعه الخادم بسرّ لا يظهر للموقع: المعلم «مشرف»، والطالب «مشارك».
--    (يعمل بلا رمز إن لم يُضبط السرّ بعد.)
--  - الحضور يُسجَّل تلقائياً: أول دخول، وآخر ظهور، ومدة البقاء (نبضة كل دقيقة).
--
-- يتطلب 003 و009 و053 و081. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.live_sessions (
  id           text primary key default ('lv-' || encode(extensions.gen_random_bytes(6), 'hex')),
  series_id    text,
  branch_id    text,
  class_ids    jsonb not null default '[]'::jsonb,
  subject_id   text,
  teacher_id   text not null,
  teacher_name text not null default '',
  title        text not null check (length(title) between 1 and 200),
  notes        text not null default '' check (length(notes) <= 2000),
  starts_at    timestamptz not null,
  duration_min int not null default 35 check (duration_min between 5 and 240),
  room         text not null unique default ('itqan-' || encode(extensions.gen_random_bytes(10), 'hex')),
  status       text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  started_at   timestamptz,
  ended_at     timestamptz,
  chat_locked  boolean not null default false,
  reminded     boolean not null default false,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists live_sessions_start_idx on public.live_sessions (starts_at);
create index if not exists live_sessions_series_idx on public.live_sessions (series_id);
create index if not exists live_sessions_classes_idx on public.live_sessions using gin (class_ids);

create table if not exists public.live_attendance (
  session_id text not null references public.live_sessions (id) on delete cascade,
  user_id    text not null,
  first_join timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  seconds    int not null default 0,
  joins      int not null default 1,
  primary key (session_id, user_id)
);
create index if not exists live_attendance_user_idx on public.live_attendance (user_id);

-- الجدولان خلف دوال فقط (لا قراءة ولا كتابة مباشرة): اسم الغرفة لا يصل للطالب قبل بدء الحصة
alter table public.live_sessions enable row level security;
alter table public.live_attendance enable row level security;
revoke all on public.live_sessions, public.live_attendance from public, anon, authenticated;

-- سرّ توقيع رموز الدخول: في مخطط itqan الخاص (لا يصل إليه الموقع)
create table if not exists itqan.live_config (
  id      int primary key default 1 check (id = 1),
  app_id  text not null default 'itqan',
  secret  text not null default '',
  updated_at timestamptz not null default now()
);
revoke all on itqan.live_config from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- دوال مساعدة
-- ---------------------------------------------------------------------
create or replace function itqan.b64url(p bytea)
returns text language sql immutable set search_path = '' as $$
  select translate(rtrim(replace(replace(encode(p, 'base64'), E'\n', ''), E'\r', ''), '='), '+/', '-_');
$$;

-- رمز JWT (HS256) لخادم Jitsi
create or replace function itqan.live_jwt(p_payload jsonb, p_secret text)
returns text language sql immutable set search_path = '' as $$
  with parts as (
    select itqan.b64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8')) || '.'
        || itqan.b64url(convert_to(p_payload::text, 'utf8')) as hp)
  select hp || '.' || itqan.b64url(extensions.hmac(convert_to(hp, 'utf8'), convert_to(p_secret, 'utf8'), 'sha256')) from parts;
$$;

-- هل الفصل ضمن إسناد المستخدم الحالي؟ (المدير والمشرف: أي فصل)
create or replace function itqan.live_can_manage_class(p_class text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.is_admin() or itqan.my_role() = 'supervisor' or exists (
    select 1 from public.users u
     where u.id::text = itqan.uid() and u.role::text = 'teacher'
       and (coalesce(u.assigned_class_ids, '[]'::jsonb) ? p_class or u.class_id = p_class));
$$;

-- هل يدير المستخدم الحالي هذه الحصة؟ (معلمها أو المدير أو المشرف)
create or replace function itqan.live_owner(s public.live_sessions)
returns boolean language sql stable security definer set search_path = '' as $$
  select s.teacher_id = itqan.uid() or itqan.is_admin() or itqan.my_role() = 'supervisor';
$$;

-- هل يرى المستخدم الحالي هذه الحصة؟
create or replace function itqan.live_visible(s public.live_sessions)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_role text := itqan.my_role(); v_branch text;
begin
  if v_role is null then return false; end if;
  if v_role in ('admin', 'teacher', 'supervisor') then
    v_branch := itqan.my_branch();
    return v_branch is null or s.branch_id is null or s.branch_id = v_branch or s.teacher_id = itqan.uid();
  end if;
  if v_role = 'student' then
    return exists (select 1 from public.users u where u.id::text = itqan.uid() and u.class_id is not null and s.class_ids ? u.class_id);
  end if;
  if v_role = 'parent' then
    return exists (select 1 from public.users u
                    where u.id::text = any(itqan.my_children()) and u.class_id is not null and s.class_ids ? u.class_id);
  end if;
  return false;
end $$;

-- الحالة الفعلية: «مباشرة» قديمة تُعدّ منتهية، و«مجدولة» فات وقتها تُعدّ فائتة
create or replace function itqan.live_state(s public.live_sessions)
returns text language sql stable set search_path = '' as $$
  select case
    when s.status = 'live' and now() > coalesce(s.started_at, s.starts_at) + make_interval(mins => s.duration_min + 60) then 'ended'
    when s.status = 'scheduled' and now() > s.starts_at + make_interval(mins => s.duration_min) then 'missed'
    else s.status end;
$$;

create or replace function itqan.live_row(s public.live_sessions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'series_id', s.series_id, 'class_ids', s.class_ids, 'subject_id', s.subject_id,
    'teacher_id', s.teacher_id, 'teacher_name', s.teacher_name, 'title', s.title, 'notes', s.notes,
    'starts_at', s.starts_at, 'duration_min', s.duration_min, 'status', itqan.live_state(s),
    'started_at', s.started_at, 'ended_at', s.ended_at, 'chat_locked', s.chat_locked,
    'can_manage', itqan.live_owner(s),
    'attended', (select jsonb_build_object('seconds', a.seconds, 'first_join', a.first_join)
                   from public.live_attendance a where a.session_id = s.id and a.user_id = itqan.uid()));
$$;

grant execute on function itqan.live_can_manage_class(text), itqan.live_owner(public.live_sessions),
  itqan.live_visible(public.live_sessions), itqan.live_state(public.live_sessions), itqan.live_row(public.live_sessions)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- القائمة: الحصص المرئية للمستخدم بين تاريخين
-- ---------------------------------------------------------------------
create or replace function public.itqan_live_list(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(itqan.live_row(s) order by s.starts_at), '[]'::jsonb)
    from public.live_sessions s
   where s.starts_at >= coalesce(p_from, now() - interval '7 days')
     and s.starts_at < coalesce(p_to, now() + interval '30 days')
     and itqan.live_visible(s);
$$;

-- ---------------------------------------------------------------------
-- إنشاء/تعديل: p_repeat_until = تكرار أسبوعي حتى هذا التاريخ (للإنشاء فقط)
--  p_weekdays = أيام إضافية في الأسبوع (0 = الأحد) مع نفس الوقت
-- ---------------------------------------------------------------------
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
begin
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
      reminded = case when starts_at <> v_start then false else reminded end
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
                                        starts_at, duration_min, created_by)
      values (v_series, nullif(v_me.branch_id, ''), v_classes, nullif(p ->> 'subject_id', ''),
              v_me.id::text, coalesce(v_me.name, ''),
              v_title, coalesce(p ->> 'notes', ''),
              (v_day + v_local::time) at time zone 'Asia/Riyadh', v_dur, v_uid);
      v_n := v_n + 1;
      if v_n > 120 then raise exception 'repeat_too_long'; end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return jsonb_build_object('ok', true, 'created', v_n, 'series_id', v_series);
end $$;

-- حذف حصص (أو سلسلة كاملة من تاريخ معيّن)
create or replace function public.itqan_live_delete(p_ids text[], p_series_from boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare n int := 0; s public.live_sessions; k int;
begin
  for s in select * from public.live_sessions where id = any(p_ids) loop
    if not itqan.live_owner(s) then raise exception 'forbidden'; end if;
    if p_series_from and s.series_id is not null then
      delete from public.live_sessions x where x.series_id = s.series_id and x.starts_at >= s.starts_at
        and (x.teacher_id = itqan.uid() or itqan.is_admin() or itqan.my_role() = 'supervisor');
    else
      delete from public.live_sessions x where x.id = s.id;
    end if;
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;

-- الحالة (إنهاء/إلغاء/إعادة جدولة) وقفل الشات
create or replace function public.itqan_live_set(p_id text, p_status text default null, p_chat_locked boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null then raise exception 'not_found'; end if;
  if not itqan.live_owner(s) then raise exception 'forbidden'; end if;
  if p_status is not null and p_status not in ('scheduled', 'ended', 'cancelled') then raise exception 'bad_status'; end if;
  update public.live_sessions set
    status = coalesce(p_status, status),
    ended_at = case when p_status = 'ended' then now() when p_status = 'scheduled' then null else ended_at end,
    started_at = case when p_status = 'scheduled' then null else started_at end,
    chat_locked = coalesce(p_chat_locked, chat_locked)
   where id = p_id returning * into s;
  return itqan.live_row(s);
end $$;

-- ---------------------------------------------------------------------
-- الدخول: يبدأ الحصة إن كان الداخل مديرها، ويعيد اسم الغرفة ورمز الدخول، ويسجّل الحضور
-- ---------------------------------------------------------------------
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
begin
  select * into s from public.live_sessions where id = p_id for update;
  if s.id is null or not itqan.live_visible(s) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_me from public.users where id::text = v_uid;
  if v_me.role::text = 'parent' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_domain is null then return jsonb_build_object('ok', false, 'error', 'not_configured'); end if;
  v_mod := itqan.live_owner(s);
  v_state := itqan.live_state(s);
  if v_state = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'cancelled'); end if;

  if v_mod then
    if s.status <> 'live' or v_state = 'ended' then
      update public.live_sessions set status = 'live', started_at = now(), ended_at = null where id = s.id returning * into s;
      -- إشعار الطلاب ببدء الحصة
      select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_students
        from public.users u where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id;
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
    return jsonb_build_object('ok', false, 'error', case when v_state in ('ended', 'missed') then 'ended' else 'not_started' end);
  end if;

  insert into public.live_attendance (session_id, user_id) values (s.id, v_uid)
    on conflict (session_id, user_id) do update set joins = public.live_attendance.joins + 1, last_seen = now();

  select * into v_cfg from itqan.live_config where id = 1;
  if coalesce(v_cfg.secret, '') <> '' then
    v_jwt := itqan.live_jwt(jsonb_build_object(
      'aud', 'jitsi', 'iss', v_cfg.app_id, 'sub', v_domain, 'room', s.room,
      'nbf', extract(epoch from now())::bigint - 60,
      'exp', extract(epoch from now())::bigint + (s.duration_min + 120) * 60,
      'moderator', v_mod,
      'context', jsonb_build_object('user', jsonb_build_object(
        'id', v_uid, 'name', coalesce(v_me.name, ''), 'moderator', v_mod,
        'affiliation', case when v_mod then 'owner' else 'member' end))), v_cfg.secret);
  end if;

  return jsonb_build_object('ok', true, 'domain', v_domain, 'room', s.room, 'jwt', v_jwt,
    'moderator', v_mod, 'name', coalesce(v_me.name, ''), 'session', itqan.live_row(s));
end $$;

-- نبضة كل دقيقة أثناء الحصة: تزيد مدة الحضور وتعيد حالة الحصة وقفل الشات
create or replace function public.itqan_live_ping(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; a public.live_attendance;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null then return jsonb_build_object('ok', false); end if;
  update public.live_attendance
     set seconds = seconds + least(greatest(extract(epoch from now() - last_seen)::int, 0), 90), last_seen = now()
   where session_id = p_id and user_id = itqan.uid() returning * into a;
  return jsonb_build_object('ok', a.session_id is not null, 'status', itqan.live_state(s), 'chat_locked', s.chat_locked);
end $$;

-- كشف الحضور: طلاب فصول الحصة مع حضور كل منهم
create or replace function public.itqan_live_attendance(p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null or not itqan.is_staff() or not itqan.live_visible(s) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'class_id', u.class_id,
             'first_join', a.first_join, 'last_seen', a.last_seen, 'seconds', coalesce(a.seconds, 0), 'joins', coalesce(a.joins, 0))
             order by (a.user_id is null), u.name)
      from public.users u
      left join public.live_attendance a on a.session_id = s.id and a.user_id = u.id::text
     where u.role::text = 'student' and u.class_id is not null and s.class_ids ? u.class_id), '[]'::jsonb);
end $$;

-- ضبط سرّ رموز الدخول (المدير فقط؛ لا يُعاد السرّ أبداً)
create or replace function public.itqan_live_config_set(p_app_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.is_admin() then raise exception 'forbidden'; end if;
  insert into itqan.live_config (id, app_id, secret, updated_at)
  values (1, coalesce(nullif(btrim(p_app_id), ''), 'itqan'), coalesce(btrim(p_secret), ''), now())
  on conflict (id) do update set app_id = excluded.app_id,
    secret = case when p_secret is null then itqan.live_config.secret else excluded.secret end, updated_at = now();
  return public.itqan_live_config_status();
end $$;

create or replace function public.itqan_live_config_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not itqan.is_admin() then jsonb_build_object('configured', false)
    else jsonb_build_object('configured', coalesce((select secret <> '' from itqan.live_config where id = 1), false),
                            'app_id', coalesce((select app_id from itqan.live_config where id = 1), 'itqan')) end;
$$;

revoke all on function public.itqan_live_list(timestamptz, timestamptz), public.itqan_live_save(jsonb, date, int[]),
  public.itqan_live_delete(text[], boolean), public.itqan_live_set(text, text, boolean), public.itqan_live_join(text),
  public.itqan_live_ping(text), public.itqan_live_attendance(text), public.itqan_live_config_set(text, text),
  public.itqan_live_config_status() from public;
grant execute on function public.itqan_live_list(timestamptz, timestamptz), public.itqan_live_save(jsonb, date, int[]),
  public.itqan_live_delete(text[], boolean), public.itqan_live_set(text, text, boolean), public.itqan_live_join(text),
  public.itqan_live_ping(text), public.itqan_live_attendance(text), public.itqan_live_config_set(text, text),
  public.itqan_live_config_status() to anon, authenticated;

-- ---------------------------------------------------------------------
-- التذكير قبل الحصة + إغلاق الحصص المنسية (ضمن الجدولة كل 5 دقائق)
-- ---------------------------------------------------------------------
create or replace function itqan.live_tick()
returns text language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; v_students jsonb; n int := 0;
begin
  update public.live_sessions set status = 'ended', ended_at = now()
   where status = 'live' and now() > coalesce(started_at, starts_at) + make_interval(mins => duration_min + 60);
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
  return case when n > 0 then 'live:' || n end;
end $$;
revoke all on function itqan.live_tick() from public, anon, authenticated;

-- الجدولة: نفس دالة 081 مع إضافة الحصص المباشرة
create or replace function itqan.auto_tick()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Riyadh';
  v_day date := v_now::date;
  v_t time := v_now::time;
  ms jsonb := coalesce((select value from public.app_settings where key = 'morning_summary'), '{}'::jsonb);
  wr jsonb := coalesce((select value from public.app_settings where key = 'weekly_report'), '{}'::jsonb);
  wa jsonb := coalesce((select value from public.app_settings where key = 'weekly_admin'), '{}'::jsonb);
  t_ms time := itqan.cfg_time(ms ->> 'time', '06:45');
  t_wr time := itqan.cfg_time(wr ->> 'time', '14:40');
  d_wr int := coalesce(nullif(wr ->> 'day', '')::int, 4);
  t_wa time := itqan.cfg_time(wa ->> 'time', '13:30');
  d_wa int := coalesce(nullif(wa ->> 'day', '')::int, 4);
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
  -- التقرير الأسبوعي لأولياء الأمور (extract(dow): الأحد = 0)
  if extract(dow from v_day)::int = d_wr and v_t >= t_wr and v_t < t_wr + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'weekly_report'), '-infinity') < v_day then
    r := itqan.weekly_parent_notify();
    insert into itqan.auto_runs values ('weekly_report', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'weekly:' || r || ' ';
  end if;
  -- التقرير الأسبوعي للإدارة
  if extract(dow from v_day)::int = d_wa and v_t >= t_wa and v_t < t_wa + interval '3 hours'
     and coalesce((select last_day from itqan.auto_runs where key = 'weekly_admin'), '-infinity') < v_day then
    r := itqan.weekly_admin_notify();
    insert into itqan.auto_runs values ('weekly_admin', v_day, now(), r)
      on conflict (key) do update set last_day = excluded.last_day, last_at = excluded.last_at, result = excluded.result;
    out := out || 'admin:' || r || ' ';
  end if;
  -- الحصص المباشرة: التذكير وإغلاق المنسية
  begin
    r := itqan.live_tick();
    if r is not null then out := out || r; end if;
  exception when others then null;
  end;
  return nullif(btrim(out), '');
end $$;
revoke all on function itqan.auto_tick() from public, anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 083: الحصص المباشرة (جدول، تذكير، دخول آمن، حضور تلقائي)' as result;
