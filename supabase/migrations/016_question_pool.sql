-- =====================================================================
-- منصة إتقان: 016 — أسئلة مختلفة لكل طالب من نفس الاختبار
--  - إعداد للاختبار: عدد الأسئلة لكل طالب (مثلاً 20 من 50). فارغ = كل الأسئلة.
--  - الخادم يختار أسئلة كل طالب بترتيب ثابت (لا يتغير بتحديث الصفحة)، ويصحّح على أسئلته فقط.
--
-- يتطلب 014 قبله (itqan_submit_quiz_v2). التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

alter table public.quizzes add column if not exists questions_per_student integer;

-- أسئلة هذا الطالب في هذا الاختبار (القطعة بأسئلتها الفرعية تُعد سؤالاً واحداً)
create or replace function itqan.served_question_ids(p_quiz jsonb, p_student text)
returns text[] language sql immutable set search_path = '' as $$
  with qs as (
    select q ->> 'id' as id
    from jsonb_array_elements(case when jsonb_typeof(p_quiz -> 'questions') = 'array' then p_quiz -> 'questions' else '[]'::jsonb end) q
  ), n as (
    select nullif(p_quiz ->> 'questions_per_student', '')::int as k, (select count(*) from qs) as total
  )
  select case
    when (select k from n) is null or (select k from n) <= 0 or (select k from n) >= (select total from n)
      then (select coalesce(array_agg(id), '{}') from qs)
    else (select coalesce(array_agg(id), '{}') from (
      select id from qs order by md5(p_student || ':' || (p_quiz ->> 'id') || ':' || id) limit (select k from n)) s)
  end;
$$;

-- للطالب: معرّفات أسئلته في اختبار متاح له
create or replace function public.itqan_served_questions(p_quiz_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_student public.users; v_quiz public.quizzes; v_q jsonb;
begin
  select * into v_student from public.users where id::text = itqan.uid() and role = 'student';
  if not found then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into v_quiz from public.quizzes where id::text = p_quiz_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'quiz_not_found'); end if;
  v_q := to_jsonb(v_quiz);
  if coalesce(v_q ->> 'status', 'published') <> 'published'
     or coalesce((v_q ->> 'is_deleted')::boolean, false)
     or not itqan.quiz_targets_student(v_quiz, v_student) then
    return jsonb_build_object('ok', false, 'error', 'quiz_not_available');
  end if;
  return jsonb_build_object('ok', true, 'question_ids', to_jsonb(itqan.served_question_ids(v_q, v_student.id::text)));
end $$;

-- التسليم: نفس 014، ثم إن كان للاختبار عدد أسئلة لكل طالب تُحسب الدرجة على أسئلة الطالب فقط
create or replace function public.itqan_submit_quiz_v2(
  p_quiz_id text, p_answers jsonb, p_time_spent integer, p_client_id text default null, p_integrity jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb;
  v_id text;
  v_clean jsonb;
  v_row jsonb;
  v_quiz jsonb;
  v_served text[];
  v_answers jsonb;
  v_score numeric; v_total numeric;
  n_leaves int; n_away int; n_fs int;
begin
  v_res := public.itqan_submit_quiz(p_quiz_id, p_answers, p_time_spent, p_client_id);
  v_id := v_res -> 'submission' ->> 'id';
  if not coalesce((v_res ->> 'ok')::boolean, false) or v_id is null then
    return v_res;
  end if;

  -- سجل الخروج (014)
  if jsonb_typeof(p_integrity) = 'object' then
    n_leaves := case when jsonb_typeof(p_integrity -> 'leaves') = 'number' then least(greatest((p_integrity ->> 'leaves')::numeric, 0), 100000)::int end;
    n_away := case when jsonb_typeof(p_integrity -> 'away_seconds') = 'number' then least(greatest((p_integrity ->> 'away_seconds')::numeric, 0), 100000)::int end;
    n_fs := case when jsonb_typeof(p_integrity -> 'fullscreen_exits') = 'number' then least(greatest((p_integrity ->> 'fullscreen_exits')::numeric, 0), 100000)::int end;
    v_clean := jsonb_strip_nulls(jsonb_build_object('leaves', n_leaves, 'away_seconds', n_away, 'fullscreen_exits', n_fs));
    update public.submissions s set integrity = v_clean
    where s.id::text = v_id and s.student_id::text = itqan.uid() and s.integrity is null;
  end if;

  -- ورقة الإجابة: عناصر الأسئلة فقط (دالة 004 تضيف عنصراً زائداً بلا question_id بعد كل سؤال اختيار)،
  -- ومع «أسئلة مختلفة لكل طالب» أسئلة هذا الطالب فقط والدرجة عليها وحدها
  select to_jsonb(q) into v_quiz from public.quizzes q where q.id::text = p_quiz_id;
  v_served := case when coalesce(nullif(v_quiz ->> 'questions_per_student', '')::int, 0) > 0
    then itqan.served_question_ids(v_quiz, itqan.uid()) end;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_answers
  from jsonb_array_elements(v_res -> 'submission' -> 'answers_json') a
  where a ? 'question_id' and (v_served is null or a ->> 'question_id' = any(v_served));

  if v_served is not null then
    select coalesce(sum(coalesce(nullif(a ->> 'marks_awarded', '')::numeric, 0)), 0) into v_score
    from jsonb_array_elements(v_answers) a;
    select coalesce(sum(case when q ->> 'type' = 'passage'
        then (select coalesce(sum(coalesce(nullif(sq ->> 'marks', '')::numeric, 0)), 0) from jsonb_array_elements(coalesce(q -> 'sub_questions', '[]'::jsonb)) sq)
        else coalesce(nullif(q ->> 'marks', '')::numeric, 0) end), 0) into v_total
    from jsonb_array_elements(v_quiz -> 'questions') q
    where q ->> 'id' = any(v_served);
    update public.submissions s set
      answers_json = v_answers,
      score = v_score,
      total_possible_score = v_total,
      percentage = case when v_total > 0 then round(v_score / v_total * 100) else 0 end
    where s.id::text = v_id and s.student_id::text = itqan.uid();
  elsif jsonb_array_length(v_answers) <> jsonb_array_length(coalesce(v_res -> 'submission' -> 'answers_json', '[]'::jsonb)) then
    update public.submissions s set answers_json = v_answers
    where s.id::text = v_id and s.student_id::text = itqan.uid();
  end if;

  select to_jsonb(s) into v_row from public.submissions s where s.id::text = v_id;
  if v_row is not null then
    v_res := jsonb_set(v_res, '{submission}', v_row);
  end if;
  return v_res;
end $$;

revoke execute on function public.itqan_served_questions(text) from public;
grant execute on function public.itqan_served_questions(text) to anon, authenticated;
grant execute on function itqan.served_question_ids(jsonb, text) to anon, authenticated;
revoke execute on function public.itqan_submit_quiz_v2(text, jsonb, integer, text, jsonb) from public;
grant execute on function public.itqan_submit_quiz_v2(text, jsonb, integer, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 016: أسئلة مختلفة لكل طالب' as result;
