-- =====================================================================
-- منصة إتقان: 074 — إشعار المعلم عند تسليم طالب لاختباره
--  - أول تسليم: إشعار «سلّم فلان اختبار …» (ويصل للجوال إن كانت الإشعارات مفعّلة).
--  - التسليمات التالية لنفس الاختبار تُجمَّع في الإشعار نفسه ما دام غير مقروء (خلال 12 ساعة):
--    يتحدّث العدد واسم آخر من سلّم، بدل عشرات الإشعارات وقت الاختبارات.
--  - يصل لمعلم الاختبار ومنشئه.
--
-- يتطلب 001 و003. آمن لإعادة التشغيل.
-- =====================================================================

create index if not exists notifications_type_ref_idx on public.notifications (type, ref_id);

create or replace function itqan.notify_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_quiz record; v_name text; v_pct text; r text; v_old record; v_cnt int;
begin
  select q.id::text id, q.title, q.teacher_id::text teacher_id, to_jsonb(q) ->> 'created_by' created_by
    into v_quiz from public.quizzes q where q.id::text = new.quiz_id::text;
  if not found then return new; end if;
  select u.name into v_name from public.users u where u.id::text = new.student_id::text and u.role::text = 'student';
  if v_name is null then return new; end if;
  v_pct := coalesce(round(new.percentage)::text, '0') || '%';

  for r in select distinct x from unnest(array[v_quiz.teacher_id, v_quiz.created_by]) x
           where x is not null and x <> '' and exists (select 1 from public.users u where u.id::text = x and u.role::text <> 'student') loop
    select n.id, coalesce((n.audience ->> 'count')::int, 1) cnt into v_old
    from public.notifications n
    where n.type = 'quiz_submitted' and n.ref_id = v_quiz.id and n.audience -> 'user_ids' = jsonb_build_array(r)
      and n.created_at > now() - interval '12 hours'
      and not exists (select 1 from public.notification_reads nr where nr.user_id = r and nr.notification_id = n.id)
    order by n.created_at desc limit 1;

    if found then
      v_cnt := v_old.cnt + 1;
      update public.notifications
         set title = 'تسليمات جديدة في «' || v_quiz.title || '» (' || v_cnt || ')',
             body = 'آخرهم: ' || v_name || ' — ' || v_pct,
             audience = audience || jsonb_build_object('count', v_cnt),
             created_at = now()
       where id = v_old.id;
    else
      insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
      values ('ntf-sub-' || encode(extensions.gen_random_bytes(8), 'hex'), 'quiz_submitted',
              'سلّم ' || v_name || ' اختبار «' || v_quiz.title || '»', 'النسبة: ' || v_pct,
              jsonb_build_object('user_ids', jsonb_build_array(r), 'count', 1),
              'quiz', v_quiz.id, new.student_id::text, v_name);
    end if;
  end loop;
  return new;
exception when others then
  -- الإشعار لا يمنع حفظ التسليم أبداً
  return new;
end $$;

drop trigger if exists itqan_submissions_notify on public.submissions;
create trigger itqan_submissions_notify after insert on public.submissions
  for each row execute function itqan.notify_submission();

select '✓ تم تحديث 074: إشعار المعلم عند تسليم الاختبار' as result;
