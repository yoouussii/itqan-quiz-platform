-- =====================================================================
-- 087: الجلسة لا تنتهي أثناء الاستخدام (خصوصاً أثناء الحصص المباشرة)
--  كانت الجلسة تنتهي بعد 12 ساعة من تسجيل الدخول مهما كان المستخدم نشطاً،
--  فقد يخرج الطالب أو المعلم في منتصف الحصة. الآن: المستخدم النشط تُمدّ جلسته
--  تلقائياً (3 ساعات من آخر نشاط)، وغير النشط تنتهي جلسته كما كانت.
--  آمن لإعادة التشغيل.
-- =====================================================================

-- تمديد جلسة صاحب الطلب إن بقي عليها أقل من ساعتين (كتابة واحدة كل ساعة تقريباً على الأكثر)
create or replace function itqan.touch_session()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update itqan.sessions
     set expires_at = now() + interval '3 hours'
   where token_hash = itqan.hash_token(itqan.request_token())
     and expires_at > now()
     and expires_at < now() + interval '2 hours';
exception when others then null;
end $$;

-- التحقق الدوري من الجلسة (كل بضع دقائق من كل جهاز مفتوح) يمدّها
create or replace function public.itqan_session_user()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb;
begin
  select to_jsonb(u) - 'password' into v from public.users u where u.id::text = itqan.uid();
  if v is not null then perform itqan.touch_session(); end if;
  return v;
end $$;

-- نبضة الحضور داخل الحصة (كل 30–60 ثانية) تمدّ الجلسة أيضاً
create or replace function public.itqan_live_ping(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions; a public.live_attendance;
begin
  select * into s from public.live_sessions where id = p_id;
  if s.id is null then return jsonb_build_object('ok', false); end if;
  update public.live_attendance
     set seconds = seconds + least(greatest(extract(epoch from now() - last_seen)::int, 0), 90), last_seen = now()
   where session_id = p_id and user_id = itqan.uid() returning * into a;
  if a.session_id is not null then perform itqan.touch_session(); end if;
  return jsonb_build_object('ok', a.session_id is not null, 'status', itqan.live_state(s), 'chat_locked', s.chat_locked, 'title', s.title);
end $$;

revoke execute on function itqan.touch_session() from public;
grant execute on function public.itqan_session_user() to anon, authenticated;
grant execute on function public.itqan_live_ping(text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 087: الجلسة تُمدّ تلقائياً للمستخدم النشط (لا خروج أثناء الحصة)' as result;
