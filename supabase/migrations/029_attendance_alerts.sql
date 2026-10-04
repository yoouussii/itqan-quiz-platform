-- =====================================================================
-- منصة إتقان: 029 — تنبيه تلقائي لولي الأمر + ملخص أسبوعي للإدارة
--  - عند بلوغ غياب الطالب حدّ التنبيه خلال الفصل الدراسي يُرسل إشعار للطالب وولي أمره تلقائياً
--    (مرة عند الحد، ومرة أخرى عند كل ضعف له: 3، 6، 9…). لا يشمل طلاب «سجل فقط» (لا حسابات لهم).
--  - ملخص الأسبوع الدراسي (الأحد–الخميس) يُرسل للمدير وأصحاب صلاحيات الحضور مرة واحدة
--    بعد انتهاء الأسبوع، مع أول مزامنة من الشيت أو أول فتح لصفحة الحضور (بدون جدولة خارجية).
--  - الخياران يُفعّلان/يُعطّلان من صفحة «الربط والاستيراد».
--
-- يتطلب 022 و024 و027 و028 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table itqan.attendance_config add column if not exists auto_notify boolean not null default true;
alter table itqan.attendance_config add column if not exists weekly_digest boolean not null default true;
alter table itqan.attendance_config add column if not exists last_digest_week date;

-- آخر مستوى تنبيه أُرسل لكل طالب (المستوى = أيام الغياب ÷ الحد)
create table if not exists itqan.attendance_alerts (
  student_id text not null,
  start_date date not null,
  level      int  not null,
  at         timestamptz not null default now(),
  primary key (student_id, start_date)
);
alter table itqan.attendance_alerts enable row level security;
revoke all on itqan.attendance_alerts from public, anon, authenticated;

-- فحص التنبيه لمجموعة طلاب (يُستدعى بعد أي إضافة لسجلات الحضور)
create or replace function itqan.attendance_check_alerts(p_ids text[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config; s record; v_level int; v_prev int; v_n int := 0;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  if v_cfg.start_date is null or not v_cfg.auto_notify or v_cfg.threshold < 1 then return 0; end if;
  for s in
    select u.id::text as id, u.name, count(r.id) as absent
    from public.users u
    join public.attendance_records r on r.student_id = u.id::text and r.kind = 'absent'
      and r.day >= v_cfg.start_date and r.day < v_cfg.start_date + v_cfg.weeks * 7
    where u.role::text = 'student' and u.id::text = any(p_ids)
    group by u.id, u.name
  loop
    v_level := s.absent / v_cfg.threshold;
    continue when v_level < 1;
    select a.level into v_prev from itqan.attendance_alerts a where a.student_id = s.id and a.start_date = v_cfg.start_date;
    continue when coalesce(v_prev, 0) >= v_level;
    insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
    values ('ntf-att-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
            'تنبيه غياب: ' || s.name,
            'بلغ عدد أيام غياب ' || s.name || ' ' || s.absent || ' أيام خلال الفصل الدراسي. نأمل الحرص على الانتظام في الحضور، وللاستفسار يُرجى التواصل مع إدارة المدرسة.',
            jsonb_build_object('student_ids', jsonb_build_array(s.id),
              'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                           where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ? s.id)),
            'attendance', s.id, null, 'نظام الحضور');
    insert into itqan.attendance_alerts (student_id, start_date, level) values (s.id, v_cfg.start_date, v_level)
    on conflict (student_id, start_date) do update set level = excluded.level, at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function itqan.attendance_alerts_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform itqan.attendance_check_alerts(array(select distinct n.student_id from new_rows n where n.kind = 'absent'));
  return null;
exception when others then
  return null; -- التنبيه لا يُفشل تسجيل الحضور أبداً
end $$;

drop trigger if exists attendance_alerts_after_insert on public.attendance_records;
create trigger attendance_alerts_after_insert after insert on public.attendance_records
  referencing new table as new_rows for each statement execute function itqan.attendance_alerts_trigger();

-- ملخص آخر أسبوع دراسي مكتمل (يُرسل مرة واحدة لكل أسبوع)
create or replace function itqan.attendance_weekly_digest()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.attendance_config; v_sun date; v_thu date; v_students int; v_a int; v_l int; v_e int;
  v_rate numeric; v_flagged int; v_class text; v_to jsonb;
begin
  select * into v_cfg from itqan.attendance_config where id = 1 for update;
  if v_cfg.start_date is null or not v_cfg.weekly_digest then return false; end if;
  -- أحد الأسبوع الماضي المكتمل (بعد انقضاء خميسه)
  v_sun := current_date - extract(dow from current_date)::int - 7;
  if extract(dow from current_date)::int >= 5 then v_sun := v_sun + 7; end if;
  v_thu := v_sun + 4;
  if v_thu >= current_date or v_sun < v_cfg.start_date or v_sun >= v_cfg.start_date + v_cfg.weeks * 7 then return false; end if;
  if v_cfg.last_digest_week is not null and v_cfg.last_digest_week >= v_sun then return false; end if;

  select count(*) into v_students from public.users u where u.role::text = 'student';
  v_students := v_students + (select count(*) from public.attendance_roster);
  select count(*) filter (where kind = 'absent'), count(*) filter (where kind = 'late'), count(*) filter (where kind = 'excused')
    into v_a, v_l, v_e from public.attendance_records where day between v_sun and v_thu;
  v_rate := case when v_students > 0 then greatest(0, 1 - v_a::numeric / (v_students * 5)) else 1 end;
  select count(*) into v_flagged from (
    select student_id from public.attendance_records
    where kind = 'absent' and day >= v_cfg.start_date and day <= v_thu
    group by student_id having count(*) >= v_cfg.threshold) f;
  select c.name into v_class from public.attendance_records r
    join public.users u on u.id::text = r.student_id join public.classes c on c.id::text = u.class_id::text
    where r.kind = 'absent' and r.day between v_sun and v_thu
    group by c.name order by count(*) desc limit 1;

  select coalesce(jsonb_agg(u.id::text), '[]'::jsonb) into v_to from public.users u
  where u.role::text = 'admin'
     or (u.role::text <> 'student' and u.role::text <> 'parent' and (
          coalesce((u.teacher_permissions ->> 'can_view_attendance')::boolean, false)
          or coalesce((u.teacher_permissions ->> 'can_manage_attendance')::boolean, false)));

  update itqan.attendance_config set last_digest_week = v_sun where id = 1;
  if jsonb_array_length(v_to) = 0 then return false; end if;

  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-attw-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'ملخص الحضور للأسبوع ' || to_char(v_sun, 'YYYY-MM-DD') || ' — ' || to_char(v_thu, 'YYYY-MM-DD'),
          'نسبة الحضور ' || round(v_rate * 100, 1) || '% · غياب ' || v_a || ' · تأخر ' || v_l || ' · استئذان ' || v_e
            || ' · تجاوزوا حد الغياب (' || v_cfg.threshold || ' أيام) حتى الآن: ' || v_flagged
            || coalesce(' · الأكثر غياباً هذا الأسبوع: ' || v_class, '') || '. التفاصيل في صفحة الحضور والغياب.',
          jsonb_build_object('user_ids', v_to), 'attendance', null, null, 'نظام الحضور');
  return true;
exception when others then
  return false;
end $$;

-- يُستدعى من صفحة الحضور عند فتحها (والمزامنة تستدعيه أيضاً)
create or replace function public.itqan_attendance_digest_tick()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (itqan.has_perm('can_view_attendance') or itqan.has_perm('can_manage_attendance')) then return false; end if;
  return itqan.attendance_weekly_digest();
end $$;

-- بعد كل مزامنة/رفع: فحص الملخص الأسبوعي
create or replace function itqan.attendance_digest_on_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform itqan.attendance_weekly_digest();
  return null;
exception when others then return null;
end $$;
drop trigger if exists attendance_digest_after_sync on itqan.attendance_sync_log;
create trigger attendance_digest_after_sync after insert on itqan.attendance_sync_log
  for each statement execute function itqan.attendance_digest_on_sync();

create or replace function public.itqan_attendance_config_save(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config; u itqan.attendance_unmatched; v_id text;
begin
  if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
  update itqan.attendance_config set
    start_date = case when p ? 'start_date' then nullif(p ->> 'start_date', '')::date else start_date end,
    weeks = case when p ? 'weeks' then least(greatest(coalesce((p ->> 'weeks')::int, 18), 1), 30) else weeks end,
    threshold = case when p ? 'threshold' then least(greatest(coalesce((p ->> 'threshold')::int, 3), 1), 60) else threshold end,
    sheet_classes = case when jsonb_typeof(p -> 'sheet_classes') = 'object' then p -> 'sheet_classes' else sheet_classes end,
    auto_notify = case when p ? 'auto_notify' then coalesce((p ->> 'auto_notify')::boolean, auto_notify) else auto_notify end,
    weekly_digest = case when p ? 'weekly_digest' then coalesce((p ->> 'weekly_digest')::boolean, weekly_digest) else weekly_digest end,
    sheet_labels = case when jsonb_typeof(p -> 'sheet_labels') = 'object' then p -> 'sheet_labels' else sheet_labels end,
    updated_at = now()
  where id = 1
  returning * into v_cfg;

  -- أسماء شيتات «سجل فقط» التي بقيت في «لم تُطابق» ← قائمة الحضور
  if v_cfg.start_date is not null then
    for u in select x.* from itqan.attendance_unmatched x where v_cfg.sheet_classes ->> x.sheet = '__roster__' loop
      insert into public.attendance_roster (sheet, name, name_norm)
      values (u.sheet, u.raw_name, u.name_norm)
      on conflict (sheet, name_norm) do update set name = excluded.name
      returning id into v_id;
      perform itqan.attendance_apply(v_id, u.marks, v_cfg.start_date, v_cfg.weeks);
      delete from itqan.attendance_unmatched x where x.sheet = u.sheet and x.name_norm = u.name_norm;
    end loop;
  end if;
end $$;

revoke all on function public.itqan_attendance_config_save(jsonb) from public;
grant execute on function public.itqan_attendance_config_save(jsonb) to anon, authenticated;

create or replace function public.itqan_attendance_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config;
begin
  if not (itqan.has_perm('can_view_attendance') or itqan.has_perm('can_manage_attendance')) then return null; end if;
  select * into v_cfg from itqan.attendance_config where id = 1;
  return jsonb_build_object(
    'start_date', v_cfg.start_date, 'weeks', v_cfg.weeks, 'threshold', v_cfg.threshold, 'auto_notify', v_cfg.auto_notify, 'weekly_digest', v_cfg.weekly_digest,
    'sheet_classes', v_cfg.sheet_classes, 'sheets', coalesce(v_cfg.seen_sheets, '{}'::jsonb), 'sheet_labels', coalesce(v_cfg.sheet_labels, '{}'::jsonb), 'has_token', v_cfg.token_hash is not null,
    'log', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'source', l.source, 'by', l.by_name, 'summary', l.summary) order by l.id desc), '[]'::jsonb)
            from (select * from itqan.attendance_sync_log order by id desc limit 10) l),
    'ignored', (select coalesce(jsonb_agg(a.name_norm order by a.name_norm), '[]'::jsonb) from itqan.attendance_aliases a where a.student_id = '__ignore__'),
    'unmatched', (select coalesce(jsonb_agg(jsonb_build_object('sheet', u.sheet, 'name', u.raw_name, 'count', jsonb_array_length(u.marks)) order by u.sheet, u.raw_name), '[]'::jsonb)
                  from itqan.attendance_unmatched u));
end $$;

revoke all on function public.itqan_attendance_config() from public;
grant execute on function public.itqan_attendance_config() to anon, authenticated;

revoke all on function itqan.attendance_check_alerts(text[]), itqan.attendance_weekly_digest() from public, anon, authenticated;
revoke all on function public.itqan_attendance_digest_tick() from public;
grant execute on function public.itqan_attendance_digest_tick() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 029: تنبيه الغياب التلقائي والملخص الأسبوعي' as result;
