-- =====================================================================
-- منصة إتقان — الحماية: الجزء 4 من 5 (التسليم والتصحيح على الخادم)
-- شغّل الأجزاء بالترتيب 1 ← 5. كل جزء آمن لإعادة التشغيل.
-- يجب أن تظهر في النهاية رسالة «✓ تم الجزء 4»؛ إن ظهر خطأ فالنص لم يُنسخ كاملاً.
-- =====================================================================

-- تسليم الاختبار: يُصحَّح على الخادم ولا يُقبل من الطالب أي درجة جاهزة
create or replace function public.itqan_submit_quiz(
  p_quiz_id text, p_answers jsonb, p_time_spent integer, p_client_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_student public.users;
  v_quiz public.quizzes;
  v_q jsonb; v_quiz_json jsonb; v_questions jsonb;
  v_existing jsonb;
  v_retake boolean;
  q jsonb; a jsonb; sq jsonb; sa jsonb;
  v_graded jsonb := '[]'::jsonb; v_subs jsonb;
  v_score numeric := 0; v_total numeric := 0; v_awarded numeric; v_possible numeric; v_m numeric;
  v_sel int; v_ok boolean;
  v_row jsonb; v_inserted jsonb;
  v_start timestamptz; v_end timestamptz; v_duration numeric;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role = 'student';
  if not found then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;

  select * into v_quiz from public.quizzes where id::text = p_quiz_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'quiz_not_found'); end if;
  v_quiz_json := to_jsonb(v_quiz);

  if coalesce(v_quiz_json ->> 'status', 'published') <> 'published'
     or coalesce((v_quiz_json ->> 'is_deleted')::boolean, false)
     or not coalesce((v_quiz_json ->> 'is_active')::boolean, true)
     or not itqan.quiz_targets_student(v_quiz, v_student) then
    return jsonb_build_object('ok', false, 'error', 'quiz_not_available');
  end if;

  v_start := nullif(v_quiz_json ->> 'start_date', '')::timestamptz;
  v_end := nullif(v_quiz_json ->> 'end_date', '')::timestamptz;
  v_duration := coalesce(nullif(v_quiz_json ->> 'duration_minutes', '')::numeric, 30);
  if v_start is not null and now() < v_start - interval '2 minutes' then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;
  -- مهلة 5 دقائق بعد نهاية الإتاحة (للتسليم التلقائي وبطء الشبكة)
  if v_end is not null and now() > v_end + interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'ended');
  end if;

  -- إعادة إرسال نفس المحاولة (انقطاع الشبكة): نعيد النتيجة المحفوظة
  if p_client_id is not null then
    select to_jsonb(s) into v_existing from public.submissions s
    where s.id::text = p_client_id and s.student_id::text = v_student.id::text;
    if v_existing is not null then
      return jsonb_build_object('ok', true, 'submission', v_existing, 'questions', v_quiz_json -> 'questions');
    end if;
  end if;

  v_retake := v_student.id::text in (
    select jsonb_array_elements_text(coalesce(v_quiz_json -> 'allowed_retake_student_ids', '[]'::jsonb)));
  select to_jsonb(s) into v_existing from public.submissions s
  where s.quiz_id::text = p_quiz_id and s.student_id::text = v_student.id::text
  order by s.completed_at desc limit 1;
  if v_existing is not null and not v_retake then
    return jsonb_build_object('ok', false, 'error', 'already_submitted', 'submission', v_existing,
                              'questions', v_quiz_json -> 'questions');
  end if;

  v_questions := case when jsonb_typeof(v_quiz_json -> 'questions') = 'array' then v_quiz_json -> 'questions' else '[]'::jsonb end;
  for q in select * from jsonb_array_elements(v_questions) loop
    select x into a from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) x
    where x ->> 'question_id' = q ->> 'id' limit 1;

    if q ->> 'type' = 'passage' then
      v_subs := '[]'::jsonb; v_awarded := 0; v_possible := 0;
      for sq in select * from jsonb_array_elements(coalesce(q -> 'sub_questions', '[]'::jsonb)) loop
        sa := null;
        if a is not null and jsonb_typeof(a -> 'sub_answers') = 'array' then
          select y into sa from jsonb_array_elements(a -> 'sub_answers') y
          where y ->> 'sub_question_id' = sq ->> 'id' limit 1;
        end if;
        v_m := coalesce(nullif(sq ->> 'marks', '')::numeric, 0);
        v_sel := case when jsonb_typeof(sa -> 'selected_option') = 'number' then (sa ->> 'selected_option')::int end;
        v_ok := coalesce(sq ->> 'type', '') <> 'essay' and v_sel is not null
                and v_sel = nullif(sq ->> 'correct_option_index', '')::int;
        v_possible := v_possible + v_m;
        v_awarded := v_awarded + case when v_ok then v_m else 0 end;
        v_subs := v_subs || jsonb_strip_nulls(jsonb_build_object(
          'sub_question_id', sq ->> 'id', 'selected_option', v_sel,
          'text_answer', left(nullif(sa ->> 'text_answer', ''), 5000),
          'is_correct', v_ok, 'marks_awarded', case when v_ok then v_m else 0 end));
      end loop;
      v_total := v_total + v_possible;
      v_score := v_score + v_awarded;
      v_graded := v_graded || jsonb_build_object(
        'question_id', q ->> 'id', 'selected_option', null,
        'is_correct', v_possible > 0 and v_awarded = v_possible,
        'marks_awarded', v_awarded, 'sub_answers', v_subs);
    else
      v_m := coalesce(nullif(q ->> 'marks', '')::numeric, 0);
      v_sel := case when jsonb_typeof(a -> 'selected_option') = 'number' then (a ->> 'selected_option')::int end;
      v_ok := coalesce(q ->> 'type', '') <> 'essay' and v_sel is not null
              and v_sel = nullif(q ->> 'correct_option_index', '')::int;
      v_total := v_total + v_m;
      v_score := v_score + case when v_ok then v_m else 0 end;
      v_graded := v_graded || jsonb_strip_nulls(jsonb_build_object(
        'question_id', q ->> 'id', 'selected_option', v_sel,
        'text_answer', left(nullif(a ->> 'text_answer', ''), 5000),
        'is_correct', v_ok, 'marks_awarded', case when v_ok then v_m else 0 end))
        || jsonb_build_object('selected_option', v_sel);
    end if;
  end loop;

  v_row := jsonb_build_object(
    'id', coalesce(nullif(p_client_id, ''), 'sub-' || (extract(epoch from now()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4)),
    'quiz_id', p_quiz_id,
    'student_id', v_student.id::text,
    'score', v_score,
    'total_possible_score', v_total,
    'percentage', case when v_total > 0 then round(v_score / v_total * 100) else 0 end,
    'answers_json', v_graded,
    'completed_at', now(),
    'status', 'completed',
    'time_spent_seconds', greatest(0, least(coalesce(p_time_spent, 0), (v_duration * 60 + 300)::int)),
    'is_retake', v_existing is not null
  );
  v_inserted := itqan.insert_json('submissions', v_row);

  if v_retake then
    -- إلغاء إذن الإعادة بعد استخدامه (يعمل سواء كان العمود text[] أو jsonb)
    execute format(
      'update public.quizzes set allowed_retake_student_ids = %s, updated_at = now() where id::text = $1',
      case when (select c.data_type from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'quizzes'
                   and c.column_name = 'allowed_retake_student_ids') in ('jsonb', 'json')
        then '(select coalesce(jsonb_agg(x), ''[]''::jsonb) from jsonb_array_elements_text(to_jsonb(allowed_retake_student_ids)) x where x <> $2)'
        else '(select coalesce(array_agg(x), ''{}'') from unnest(allowed_retake_student_ids) x where x::text <> $2)'
      end)
    using p_quiz_id, v_student.id::text;
  end if;

  return jsonb_build_object('ok', true, 'submission', v_inserted, 'questions', v_questions);
end $$;

revoke execute on function public.itqan_login(text, text), public.itqan_logout(), public.itqan_session_user(),
  public.itqan_change_password(text, text), public.itqan_student_quizzes(),
  public.itqan_submit_quiz(text, jsonb, integer, text) from public;
grant execute on function public.itqan_login(text, text), public.itqan_logout(), public.itqan_session_user(),
  public.itqan_change_password(text, text), public.itqan_student_quizzes(),
  public.itqan_submit_quiz(text, jsonb, integer, text) to anon, authenticated;

select '✓ تم الجزء 4 من 5' as result;
