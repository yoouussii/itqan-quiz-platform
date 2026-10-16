-- =====================================================================
-- 089: جدول الحصص الأونلاين (استيراد جدول المدرسة) واجتماع Zoom ثابت لكل معلم
--  - المدير يستورد جدول الفصول (الفصل، اليوم، الحصة ← المادة والمعلم) فتُنشأ الحصص
--    المباشرة لكل معلم تلقائياً في مواعيد الحصص الثابتة لفترة يحددها.
--  - كل معلم يحفظ رقم اجتماعه في Zoom ورمزه مرة واحدة، فتستخدمه كل حصصه من الجدول.
--  - المعلم يكتب عنوان الدرس فقط (العنوان الافتراضي اسم المادة).
--  يتطلب 083–088. آمن لإعادة التشغيل.
-- =====================================================================

alter table itqan.zoom_keys add column if not exists meeting text not null default '';
alter table itqan.zoom_keys add column if not exists passcode text not null default '';

-- الجدول الحالي (آخر استيراد) لعرضه وإعادة توليد الحصص
create table if not exists itqan.live_timetable (
  class_id   text not null,
  dow        int not null check (dow between 0 and 6),
  period     int not null check (period between 1 and 12),
  teacher_id text,
  subject_id text,
  title      text not null default '',
  primary key (class_id, dow, period)
);
revoke all on itqan.live_timetable from public, anon, authenticated;

create or replace function public.itqan_zoom_keys_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'configured', coalesce((select client_id <> '' and client_secret <> '' from itqan.zoom_keys where user_id = itqan.uid()), false),
    'client_id', (select client_id from itqan.zoom_keys where user_id = itqan.uid()),
    'meeting', (select nullif(meeting, '') from itqan.zoom_keys where user_id = itqan.uid()),
    'passcode', (select nullif(passcode, '') from itqan.zoom_keys where user_id = itqan.uid()));
$$;

-- اجتماع المعلم الثابت: يُحفظ ويُطبَّق على حصصه القادمة من الجدول
create or replace function public.itqan_zoom_meeting_set(p_meeting text, p_passcode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid(); v_old text; v_m text := regexp_replace(coalesce(p_meeting, ''), '[^0-9]', '', 'g');
begin
  if not coalesce(itqan.is_staff(), false) then raise exception 'forbidden'; end if;
  if v_m <> '' and (length(v_m) < 9 or length(v_m) > 12) then raise exception 'bad_zoom'; end if;
  if length(coalesce(p_passcode, '')) > 40 then raise exception 'bad_zoom'; end if;
  select meeting into v_old from itqan.zoom_keys where user_id = v_uid;
  insert into itqan.zoom_keys (user_id, meeting, passcode, updated_at)
  values (v_uid, v_m, coalesce(btrim(p_passcode), ''), now())
  on conflict (user_id) do update set meeting = excluded.meeting, passcode = excluded.passcode, updated_at = now();
  -- حصص الجدول القادمة التي بلا اجتماع أو على الاجتماع القديم
  update public.live_sessions s
     set zoom_meeting = nullif(v_m, ''), zoom_passcode = nullif(coalesce(btrim(p_passcode), ''), '')
   where s.teacher_id = v_uid and s.series_id like 'tt-%' and s.starts_at > now() and s.external_url is null
     and s.status = 'scheduled' and (s.zoom_meeting is null or s.zoom_meeting = coalesce(v_old, ''));
  return public.itqan_zoom_keys_status();
end $$;

-- عرض الجدول الحالي (للمدير والمعلمين)
create or replace function public.itqan_live_timetable_get()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not coalesce(itqan.is_staff(), false) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('class_id', t.class_id, 'dow', t.dow, 'period', t.period,
             'teacher_id', t.teacher_id, 'subject_id', t.subject_id, 'title', t.title) order by t.class_id, t.dow, t.period)
      from itqan.live_timetable t), '[]'::jsonb) end;
$$;

-- استيراد الجدول وتوليد الحصص من p_from إلى p_to (المدير فقط)
--  p_rows: [{class_id, dow (0=الأحد), period (1..), teacher_id, subject_id, title}]
--  p_periods: [{start:"07:30", minutes:35}, …] — مواعيد الحصص الثابتة
--  p_replace: حذف حصص الجدول السابقة من p_from (التي لم يحضرها أحد) قبل التوليد
create or replace function public.itqan_live_timetable_apply(p_rows jsonb, p_periods jsonb, p_from date, p_to date, p_replace boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; d date; v_per jsonb; v_start timestamptz; v_n int := 0; v_del int := 0; v_skip int := 0;
  v_teacher public.users; v_zk itqan.zoom_keys; v_cls text; v_uid text := itqan.uid();
begin
  if not coalesce(itqan.is_admin(), false) then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 200 then raise exception 'bad_range'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_typeof(p_periods) <> 'array' then raise exception 'bad_payload'; end if;

  if p_replace then
    delete from public.live_sessions s
     where s.series_id like 'tt-%' and s.starts_at >= (p_from::timestamp at time zone 'Asia/Riyadh')
       and s.status = 'scheduled'
       and not exists (select 1 from public.live_attendance a where a.session_id = s.id);
    get diagnostics v_del = row_count;
  end if;

  delete from itqan.live_timetable where true;  -- where: إضافة safeupdate في PostgREST
  for r in select * from jsonb_array_elements(p_rows) loop
    continue when coalesce(r ->> 'class_id', '') = '' or (r ->> 'dow') !~ '^[0-6]$' or (r ->> 'period') !~ '^\d{1,2}$';
    insert into itqan.live_timetable (class_id, dow, period, teacher_id, subject_id, title)
    values (r ->> 'class_id', (r ->> 'dow')::int, (r ->> 'period')::int, nullif(r ->> 'teacher_id', ''), nullif(r ->> 'subject_id', ''),
            left(coalesce(nullif(btrim(r ->> 'title'), ''), 'حصة'), 200))
    on conflict (class_id, dow, period) do update set teacher_id = excluded.teacher_id, subject_id = excluded.subject_id, title = excluded.title;
  end loop;

  for r in select jsonb_build_object('class_id', t.class_id, 'dow', t.dow, 'period', t.period,
                                     'teacher_id', t.teacher_id, 'subject_id', t.subject_id, 'title', t.title)
             from itqan.live_timetable t where t.teacher_id is not null loop
    v_per := p_periods -> ((r ->> 'period')::int - 1);
    if v_per is null or coalesce(v_per ->> 'start', '') !~ '^\d{1,2}:\d{2}$' then v_skip := v_skip + 1; continue; end if;
    select * into v_teacher from public.users where id::text = r ->> 'teacher_id';
    if v_teacher.id is null then v_skip := v_skip + 1; continue; end if;
    select * into v_zk from itqan.zoom_keys where user_id = v_teacher.id::text;
    v_cls := r ->> 'class_id';
    d := p_from;
    while d <= p_to loop
      if extract(dow from d)::int = (r ->> 'dow')::int then
        v_start := (d + (v_per ->> 'start')::time) at time zone 'Asia/Riyadh';
        -- لا تكرار: حصة الجدول نفسها موجودة في هذا الموعد
        if not exists (select 1 from public.live_sessions s
                        where s.starts_at = v_start and s.class_ids ? v_cls and s.status <> 'cancelled') then
          insert into public.live_sessions (series_id, branch_id, class_ids, subject_id, teacher_id, teacher_name, title,
                                            starts_at, duration_min, period, zoom_meeting, zoom_passcode, created_by)
          values ('tt-' || v_cls || '-' || (r ->> 'dow') || '-' || (r ->> 'period'), v_teacher.branch_id, jsonb_build_array(v_cls),
                  r ->> 'subject_id', v_teacher.id::text, coalesce(v_teacher.name, ''), r ->> 'title',
                  v_start, greatest(5, least(240, coalesce((v_per ->> 'minutes')::int, 35))), (r ->> 'period')::int,
                  nullif(coalesce(v_zk.meeting, ''), ''), nullif(coalesce(v_zk.passcode, ''), ''), v_uid);
          v_n := v_n + 1;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'created', v_n, 'deleted', v_del, 'skipped', v_skip);
end $$;

revoke all on function public.itqan_zoom_meeting_set(text, text), public.itqan_live_timetable_get(),
  public.itqan_live_timetable_apply(jsonb, jsonb, date, date, boolean) from public;
grant execute on function public.itqan_zoom_meeting_set(text, text), public.itqan_live_timetable_get(),
  public.itqan_live_timetable_apply(jsonb, jsonb, date, date, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 089: استيراد جدول الحصص الأونلاين، واجتماع Zoom ثابت لكل معلم' as result;
