-- =====================================================================
-- منصة إتقان: 059 — أنواع أسئلة جديدة يصحّحها الخادم
--  - multi_select: أكثر من إجابة صحيحة (correct_indexes)، الدرجة كاملة عند تطابق الاختيارات.
--  - fill_blank: أكمل الفراغ (accepted_answers)، المقارنة بعد توحيد الهمزات والتاء المربوطة والتشكيل.
--  - numeric: إجابة رقمية (correct_number ± tolerance)، تقبل الأرقام العربية.
--  - ordering: ترتيب عناصر (items بالترتيب الصحيح) — تُعرض للطالب مخلوطة.
--  - matching: توصيل (pairs) — الدرجة جزئية لكل توصيلة صحيحة، والعمود الأيمن مخلوط برموز لا تكشف الحل.
--  - strip_answers يخفي مفاتيح هذه الأنواع عن الطالب.
--
-- يتطلب 004 قبله (ويبقى 014/016/055 يغلّفونه كما هم). آمن لإعادة التشغيل.
-- =====================================================================

-- توحيد النص العربي للمقارنة
create or replace function itqan.norm_ar(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(regexp_replace(coalesce(p, ''), '[ًٌٍَُِّْـ]', '', 'g')), 'أإآٱةى٠١٢٣٤٥٦٧٨٩', 'ااااهي0123456789'),
    '\s+', ' ', 'g'));
$$;

-- رمز العنصر الأيمن في التوصيل (لا يكشف الزوج الصحيح)
create or replace function itqan.match_token(p_qid text, p_pid text)
returns text language sql immutable set search_path = '' as $$
  select substr(md5(coalesce(p_qid, '') || ':' || coalesce(p_pid, '')), 1, 10);
$$;

-- تصحيح سؤال واحد (غير القطعة): يُرجع عنصر ورقة الإجابة
create or replace function itqan.grade_single(q jsonb, a jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  t text := coalesce(q ->> 'type', 'mcq');
  m numeric := coalesce(nullif(q ->> 'marks', '')::numeric, 0);
  sel int; ok boolean := false; aw numeric := 0;
  txt text := left(nullif(a ->> 'text_answer', ''), 5000);
  picks int[]; keyset int[]; num numeric; ord jsonb; mt jsonb; n int; good int;
begin
  if t = 'multi_select' then
    picks := array(select distinct (x)::int from jsonb_array_elements_text(case when jsonb_typeof(a -> 'selected_options') = 'array' then a -> 'selected_options' else '[]'::jsonb end) x where x ~ '^\d+$' order by 1);
    keyset := array(select distinct (x)::int from jsonb_array_elements_text(case when jsonb_typeof(q -> 'correct_indexes') = 'array' then q -> 'correct_indexes' else '[]'::jsonb end) x where x ~ '^\d+$' order by 1);
    ok := cardinality(keyset) > 0 and picks = keyset;
    aw := case when ok then m else 0 end;
    return jsonb_build_object('selected_option', null, 'selected_options', to_jsonb(picks), 'is_correct', ok, 'marks_awarded', aw);
  elsif t = 'fill_blank' then
    ok := txt is not null and exists (
      select 1 from jsonb_array_elements_text(case when jsonb_typeof(q -> 'accepted_answers') = 'array' then q -> 'accepted_answers' else '[]'::jsonb end) x
      where itqan.norm_ar(x) <> '' and itqan.norm_ar(x) = itqan.norm_ar(txt));
    aw := case when ok then m else 0 end;
    return jsonb_strip_nulls(jsonb_build_object('text_answer', txt, 'is_correct', ok, 'marks_awarded', aw)) || jsonb_build_object('selected_option', null);
  elsif t = 'numeric' then
    begin
      num := replace(replace(itqan.norm_ar(txt), '٫', '.'), ',', '.')::numeric;
    exception when others then num := null;
    end;
    ok := num is not null and nullif(q ->> 'correct_number', '') is not null
          and abs(num - (q ->> 'correct_number')::numeric) <= coalesce(nullif(q ->> 'tolerance', '')::numeric, 0);
    aw := case when ok then m else 0 end;
    return jsonb_strip_nulls(jsonb_build_object('text_answer', txt, 'is_correct', ok, 'marks_awarded', aw)) || jsonb_build_object('selected_option', null);
  elsif t = 'ordering' then
    ord := case when jsonb_typeof(a -> 'order') = 'array' then a -> 'order' else '[]'::jsonb end;
    ok := jsonb_array_length(coalesce(q -> 'items', '[]'::jsonb)) > 1
          and ord = (select jsonb_agg(i ->> 'id' order by k) from jsonb_array_elements(q -> 'items') with ordinality e(i, k));
    aw := case when ok then m else 0 end;
    return jsonb_build_object('selected_option', null, 'order', ord, 'is_correct', ok, 'marks_awarded', aw);
  elsif t = 'matching' then
    mt := case when jsonb_typeof(a -> 'matches') = 'object' then a -> 'matches' else '{}'::jsonb end;
    select count(*), count(*) filter (where mt ->> (p ->> 'id') = itqan.match_token(q ->> 'id', p ->> 'id'))
      into n, good from jsonb_array_elements(coalesce(q -> 'pairs', '[]'::jsonb)) p;
    ok := n > 0 and good = n;
    aw := case when n > 0 then round(m * good / n, 2) else 0 end;
    return jsonb_build_object('selected_option', null, 'matches', mt, 'is_correct', ok, 'marks_awarded', aw, 'parts_correct', good, 'parts_total', n);
  else
    -- mcq / true_false / essay كما في 004
    sel := case when jsonb_typeof(a -> 'selected_option') = 'number' then (a ->> 'selected_option')::int end;
    ok := t <> 'essay' and sel is not null and sel = nullif(q ->> 'correct_option_index', '')::int;
    aw := case when ok then m else 0 end;
    return jsonb_strip_nulls(jsonb_build_object('text_answer', txt, 'is_correct', ok, 'marks_awarded', aw)) || jsonb_build_object('selected_option', sel);
  end if;
end $$;

-- إخفاء مفاتيح الإجابة عن الطالب (والترتيب والتوصيل يُعرضان مخلوطين)
create or replace function itqan.strip_answers(p_questions jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(
    (q - 'correct_option_index' - 'correctAnswer' - 'blankAnswer' - 'explanation' - 'pairs'
       - 'correct_indexes' - 'accepted_answers' - 'correct_number' - 'tolerance' - 'items')
    || case when q ->> 'type' in ('multi_select', 'fill_blank', 'numeric', 'ordering', 'matching') then '{"answers_hidden": true}'::jsonb else '{}'::jsonb end
    || case when jsonb_typeof(q -> 'sub_questions') = 'array' then
         jsonb_build_object('sub_questions', (
           select coalesce(jsonb_agg(sq - 'correct_option_index' - 'correctAnswer' - 'explanation'), '[]'::jsonb)
           from jsonb_array_elements(q -> 'sub_questions') sq))
       else '{}'::jsonb end
    || case when q ->> 'type' = 'ordering' and jsonb_typeof(q -> 'items') = 'array' then
         jsonb_build_object('items', (select coalesce(jsonb_agg(i order by md5((q ->> 'id') || ':' || (i ->> 'id'))), '[]'::jsonb) from jsonb_array_elements(q -> 'items') i))
       else '{}'::jsonb end
    || case when q ->> 'type' = 'matching' and jsonb_typeof(q -> 'pairs') = 'array' then
         jsonb_build_object(
           'match_left', (select coalesce(jsonb_agg(jsonb_build_object('id', p ->> 'id', 'text', p ->> 'left') order by k), '[]'::jsonb) from jsonb_array_elements(q -> 'pairs') with ordinality e(p, k)),
           'match_right', (select coalesce(jsonb_agg(jsonb_build_object('id', itqan.match_token(q ->> 'id', p ->> 'id'), 'text', p ->> 'right') order by md5('r:' || (q ->> 'id') || (p ->> 'id'))), '[]'::jsonb) from jsonb_array_elements(q -> 'pairs') p))
       else '{}'::jsonb end
  ), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end) q;
$$;

-- رموز التوصيل للمعلم (معاينة الاختبار بأسئلته الكاملة)
create or replace function public.itqan_match_tokens(p_quiz_id text, p_question_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when itqan.uid() is null then null else
    (select jsonb_object_agg(p ->> 'id', itqan.match_token(p_question_id, p ->> 'id')) from public.quizzes z, jsonb_array_elements(z.questions) qq, jsonb_array_elements(coalesce(qq -> 'pairs', '[]'::jsonb)) p
      where z.id::text = p_quiz_id and qq ->> 'id' = p_question_id) end;
$$;

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
  v_started timestamptz; v_reveal boolean;
  v_sa jsonb;
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

  v_start := itqan.window_start(v_quiz_json ->> 'start_date');
  v_end := itqan.window_end(v_quiz_json ->> 'end_date');
  v_reveal := itqan.reveal_answers(v_quiz_json);
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
      return jsonb_build_object('ok', true, 'submission', v_existing, 'answers_revealed', v_reveal,
        'questions', case when v_reveal then v_quiz_json -> 'questions' else itqan.strip_answers(v_quiz_json -> 'questions') end);
    end if;
  end if;

  v_retake := v_student.id::text in (
    select jsonb_array_elements_text(coalesce(v_quiz_json -> 'allowed_retake_student_ids', '[]'::jsonb)));
  select to_jsonb(s) into v_existing from public.submissions s
  where s.quiz_id::text = p_quiz_id and s.student_id::text = v_student.id::text
  order by s.completed_at desc limit 1;
  if v_existing is not null and not v_retake then
    return jsonb_build_object('ok', false, 'error', 'already_submitted', 'submission', v_existing, 'answers_revealed', v_reveal,
      'questions', case when v_reveal then v_quiz_json -> 'questions' else itqan.strip_answers(v_quiz_json -> 'questions') end);
  end if;

  select a2.started_at into v_started from itqan.quiz_attempts a2
  where a2.student_id = v_student.id::text and a2.quiz_id = p_quiz_id;

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
      -- كل الأنواع غير القطعة (ومنها الأنواع الجديدة في 059) يصحّحها grade_single
      v_m := coalesce(nullif(q ->> 'marks', '')::numeric, 0);
      v_total := v_total + v_m;
      v_sa := itqan.grade_single(q, a);
      v_score := v_score + coalesce((v_sa ->> 'marks_awarded')::numeric, 0);
      v_graded := v_graded || (v_sa || jsonb_build_object('question_id', q ->> 'id'));
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
    -- الوقت المستغرق يُحسب من وقت البدء المسجّل على الخادم (إن وُجد)
    'time_spent_seconds', greatest(0, least(
      coalesce(extract(epoch from now() - v_started)::int, p_time_spent, 0), (v_duration * 60 + 300)::int)),
    'is_retake', v_existing is not null
  );
  v_inserted := itqan.insert_json('submissions', v_row);

  if v_retake then
    -- إلغاء إذن الإعادة بعد استخدامه (يعمل سواء كان العمود text[] أو jsonb)
    perform set_config('itqan.internal', '1', true);
    execute format(
      'update public.quizzes set allowed_retake_student_ids = %s, updated_at = now() where id::text = $1',
      case when (select c.data_type from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'quizzes'
                   and c.column_name = 'allowed_retake_student_ids') in ('jsonb', 'json')
        then '(select coalesce(jsonb_agg(x), ''[]''::jsonb) from jsonb_array_elements_text(to_jsonb(allowed_retake_student_ids)) x where x <> $2)'
        else '(select coalesce(array_agg(x), ''{}'') from unnest(allowed_retake_student_ids) x where x::text <> $2)'
      end)
    using p_quiz_id, v_student.id::text;
    perform set_config('itqan.internal', '', true);
  end if;

  delete from itqan.quiz_attempts where student_id = v_student.id::text and quiz_id = p_quiz_id;

  return jsonb_build_object('ok', true, 'submission', v_inserted, 'answers_revealed', v_reveal,
    'questions', case when v_reveal then v_questions else itqan.strip_answers(v_questions) end);
end $$;

revoke all on function public.itqan_submit_quiz(text, jsonb, integer, text) from public;
grant execute on function public.itqan_submit_quiz(text, jsonb, integer, text) to anon, authenticated;
revoke all on function itqan.grade_single(jsonb, jsonb) from public, anon, authenticated;
grant execute on function itqan.strip_answers(jsonb), itqan.norm_ar(text), itqan.match_token(text, text) to anon, authenticated;
revoke all on function public.itqan_match_tokens(text, text) from public;
grant execute on function public.itqan_match_tokens(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 059: أنواع أسئلة جديدة' as result;
