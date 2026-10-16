-- =====================================================================
-- 092: الحصص عبر Zoom فقط + إسناد تلقائي من الجدول
--  - إلغاء «خادم المدرسة» (Jitsi): حذف عنوان الخادم من الإعدادات.
--  - كل حصة بلا اجتماع ولا رابط خارجي تأخذ اجتماع معلمها الثابت تلقائياً
--    (عند الإنشاء أو التعديل، وعند حفظ المعلم اجتماعه الثابت لاحقاً).
--  - استيراد جدول الحصص يُسند لكل معلم فصوله ومواده تلقائياً (دون حذف إسناد سابق).
--  يتطلب 083–091. آمن لإعادة التشغيل.
-- =====================================================================

-- 1) إلغاء خادم المدرسة
update public.app_settings set value = value - 'domain', updated_at = now()
 where key = 'live_classes' and value ? 'domain';

-- 2) اجتماع المعلم الثابت لكل حصة بلا اجتماع
create or replace function itqan.live_fill_meeting()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_zk itqan.zoom_keys;
begin
  if new.zoom_meeting is null and new.external_url is null and new.teacher_id is not null then
    select * into v_zk from itqan.zoom_keys where user_id = new.teacher_id;
    if coalesce(v_zk.meeting, '') <> '' then
      new.zoom_meeting := v_zk.meeting;
      new.zoom_passcode := nullif(v_zk.passcode, '');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists live_fill_meeting on public.live_sessions;
create trigger live_fill_meeting before insert or update of zoom_meeting, external_url, teacher_id on public.live_sessions
  for each row execute function itqan.live_fill_meeting();

-- حفظ الاجتماع الثابت يُطبَّق على كل حصص المعلم القادمة التي بلا اجتماع أو على اجتماعه القديم
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
  update public.live_sessions s
     set zoom_meeting = nullif(v_m, ''), zoom_passcode = nullif(coalesce(btrim(p_passcode), ''), '')
   where s.teacher_id = v_uid and s.starts_at > now() - interval '3 hours' and s.external_url is null
     and s.status = 'scheduled' and (s.zoom_meeting is null or s.zoom_meeting = coalesce(nullif(v_old, ''), '-'));
  return public.itqan_zoom_keys_status();
end $$;

-- الحصص القادمة الحالية بلا اجتماع: تأخذ اجتماع معلمها الثابت الآن
update public.live_sessions s
   set zoom_meeting = k.meeting, zoom_passcode = nullif(k.passcode, '')
  from itqan.zoom_keys k
 where k.user_id = s.teacher_id and k.meeting <> '' and s.zoom_meeting is null and s.external_url is null
   and s.status = 'scheduled' and s.starts_at > now() - interval '3 hours';

-- 3) إسناد الفصل والمادة للمعلم من الجدول
create or replace function itqan.timetable_assign()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.teacher_id is null then return new; end if;
  update public.users u set
    assigned_class_ids = case when coalesce(u.assigned_class_ids, '[]'::jsonb) ? new.class_id then u.assigned_class_ids
                              else coalesce(u.assigned_class_ids, '[]'::jsonb) || to_jsonb(new.class_id) end,
    assigned_subject_ids = case when new.subject_id is null or coalesce(u.assigned_subject_ids, '[]'::jsonb) ? new.subject_id then u.assigned_subject_ids
                                else coalesce(u.assigned_subject_ids, '[]'::jsonb) || to_jsonb(new.subject_id) end
   where u.id::text = new.teacher_id and u.role::text = 'teacher'
     and (not coalesce(u.assigned_class_ids, '[]'::jsonb) ? new.class_id
          or (new.subject_id is not null and not coalesce(u.assigned_subject_ids, '[]'::jsonb) ? new.subject_id));
  return new;
end $$;

drop trigger if exists timetable_assign on itqan.live_timetable;
create trigger timetable_assign after insert or update on itqan.live_timetable
  for each row execute function itqan.timetable_assign();

-- الجدول المستورد سابقاً: إسناد الآن
update itqan.live_timetable set teacher_id = teacher_id where teacher_id is not null;

notify pgrst, 'reload schema';

select '✓ تم تحديث 092: الحصص عبر Zoom فقط، واجتماع المعلم الثابت تلقائياً، وإسناد الفصول والمواد من الجدول' as result;
