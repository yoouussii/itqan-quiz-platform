-- =====================================================================
-- منصة إتقان — الحماية: الجزء 3 من 5 (تسجيل الدخول والجلسات واختبارات الطالب)
-- شغّل الأجزاء بالترتيب 1 ← 5. كل جزء آمن لإعادة التشغيل.
-- يجب أن تظهر في النهاية رسالة «✓ تم الجزء 3»؛ إن ظهر خطأ فالنص لم يُنسخ كاملاً.
-- =====================================================================

-- ---------------------------------------------------------------------
-- دوال يستدعيها الموقع (RPC)
-- ---------------------------------------------------------------------
create or replace function public.itqan_login(p_national_id text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_key text := lower(trim(coalesce(p_national_id, '')));
  v_user public.users;
  v_hash text;
  v_attempt itqan.login_attempts;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if v_key = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_attempt from itqan.login_attempts where login_key = v_key;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'retry_after_seconds', ceil(extract(epoch from v_attempt.locked_until - now())));
  end if;

  select * into v_user from public.users u
  where lower(trim(u.national_id)) = v_key or lower(trim(coalesce(u.username, ''))) = v_key
  order by (lower(trim(u.national_id)) = v_key) desc
  limit 1;

  if found then
    select c.password_hash into v_hash from itqan.credentials c where c.user_id = v_user.id::text;
    -- مستخدم أُضيف بكلمة مرور صريحة قبل تفعيل المشغّل
    if v_hash is null and v_user.password is not null and v_user.password = p_password then
      update public.users set password = password where id = v_user.id;
      select c.password_hash into v_hash from itqan.credentials c where c.user_id = v_user.id::text;
    end if;
  end if;

  if v_hash is null or extensions.crypt(p_password, v_hash) <> v_hash then
    insert into itqan.login_attempts (login_key, failures, locked_until)
    values (v_key, 1, null)
    on conflict (login_key) do update set
      failures = itqan.login_attempts.failures + 1,
      locked_until = case when itqan.login_attempts.failures + 1 >= 8
                          then now() + interval '10 minutes' end;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  delete from itqan.login_attempts where login_key = v_key;
  delete from itqan.sessions where expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into itqan.sessions (token_hash, user_id, expires_at)
  values (itqan.hash_token(v_token), v_user.id::text, v_expires);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'user', to_jsonb(v_user) - 'password',
    'password_is_default', extensions.crypt('itqan123', v_hash) = v_hash
  );
end $$;

create or replace function public.itqan_logout()
returns void language sql security definer set search_path = '' as $$
  delete from itqan.sessions where token_hash = itqan.hash_token(itqan.request_token());
$$;

-- يعيد المستخدم صاحب الجلسة الحالية (أو null إذا انتهت أو أُلغيت)
create or replace function public.itqan_session_user()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(u) - 'password' from public.users u where u.id::text = itqan.uid();
$$;

create or replace function public.itqan_change_password(p_current text, p_new text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid text := itqan.uid(); v_hash text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  if length(coalesce(p_new, '')) < 6 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  select password_hash into v_hash from itqan.credentials where user_id = v_uid;
  if v_hash is null or extensions.crypt(coalesce(p_current, ''), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_password');
  end if;
  update public.users set password = p_new, updated_at = now() where id::text = v_uid;
  return jsonb_build_object('ok', true);
end $$;

-- اختبارات الطالب: الموجّهة له فقط، وبدون الإجابات النموذجية قبل التسليم
create or replace function public.itqan_student_quizzes()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_student public.users; q public.quizzes; v_row jsonb; v_done boolean; v_retake boolean;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role = 'student';
  if not found then return; end if;

  for q in
    select * from public.quizzes
    where coalesce(to_jsonb(quizzes) ->> 'status', 'published') = 'published'
      and not coalesce((to_jsonb(quizzes) ->> 'is_deleted')::boolean, false)
  loop
    continue when not itqan.quiz_targets_student(q, v_student);
    v_row := to_jsonb(q);
    select exists(select 1 from public.submissions s
                  where s.quiz_id::text = q.id::text and s.student_id::text = v_student.id::text)
      into v_done;
    v_retake := v_student.id::text in (
      select jsonb_array_elements_text(coalesce(v_row -> 'allowed_retake_student_ids', '[]'::jsonb)));
    if not v_done or v_retake then
      v_row := jsonb_set(v_row, '{questions}', itqan.strip_answers(v_row -> 'questions'));
    end if;
    -- اسم المعلم فقط (الطالب لا يرى بيانات المستخدمين الآخرين)
    v_row := v_row || jsonb_build_object('teacher', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'role', t.role, 'job_title', to_jsonb(t) -> 'job_title')
      from public.users t where t.id::text = v_row ->> 'teacher_id'));
    return next v_row;
  end loop;
end $$;


select '✓ تم الجزء 3 من 5' as result;
