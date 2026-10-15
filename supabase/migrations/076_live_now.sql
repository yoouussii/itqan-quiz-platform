-- =====================================================================
-- منصة إتقان: 076 — «الآن على المنصة»: من المتصل ومن يحلّ اختباراً الآن
--  - المتصل: آخر ظهور خلال 6 دقائق (072). «الحضور» صار يُحدَّث كل 5 دقائق بدل 15.
--  - يحلّ الآن: بدأ اختباراً ولم يسلّمه، وما زال داخل مدته (+10 دقائق سماح).
--  - للموظفين في فرعهم. الواجهة تسأل مرة كل دقيقة فقط والبطاقة ظاهرة والصفحة مفتوحة.
--
-- يتطلب 004 و009 و072. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_touch()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid();
begin
  if v_uid is null then return; end if;
  insert into itqan.user_presence as p (user_id, last_seen) values (v_uid, now())
  on conflict (user_id) do update set last_seen = now()
  where p.last_seen is null or p.last_seen < now() - interval '4 minutes';
end $$;

create index if not exists user_presence_seen_idx on itqan.user_presence (last_seen desc);

create or replace function public.itqan_live_now()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_branch text := itqan.my_branch();
begin
  if not coalesce(itqan.is_staff(), false) then return null; end if;
  return jsonb_build_object(
    'online', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.user_id, 's', p.last_seen) order by p.last_seen desc)
      from itqan.user_presence p
      where p.last_seen > now() - interval '6 minutes'
        and (v_branch is null or itqan.user_branch(p.user_id) = v_branch)), '[]'::jsonb),
    'in_quiz', coalesce((
      select jsonb_agg(jsonb_build_object('student_id', a.student_id, 'quiz_id', a.quiz_id, 'started_at', a.started_at) order by a.started_at)
      from itqan.quiz_attempts a
      join public.quizzes q on q.id::text = a.quiz_id
      where a.started_at > now() - make_interval(mins => coalesce(nullif(to_jsonb(q) ->> 'duration_minutes', '')::int, 30) + 10)
        and (v_branch is null or itqan.user_branch(a.student_id) = v_branch)), '[]'::jsonb),
    'at', now());
end $$;

revoke all on function public.itqan_live_now() from public;
grant execute on function public.itqan_live_now() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 076: الآن على المنصة' as result;
