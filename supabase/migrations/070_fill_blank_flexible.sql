-- =====================================================================
-- منصة إتقان: 070 — تصحيح «أكمل الفراغ» بمرونة + إعادة التصحيح بعد تعديل الإجابات
--  - الإجابة المقبولة قد تحوي بدائل: «مكبرات الصوت (أو السماعات)»، «PC / الحاسب»، «أ، ب».
--    كل بديل يُقبل وحده، مع تجاهل «ال» التعريف وعلامات الترقيم وحالة الأحرف الإنجليزية.
--  - itqan_regrade_blanks: بعد أن يضيف المعلم إجابة مقبولة، تُعاد مقارنة إجابات «أكمل الفراغ»
--    في كل تسليمات الاختبار (ما عدا ما صحّحه المعلم يدوياً) وتُحدَّث الدرجات.
--
-- يتطلب 059. آمن لإعادة التشغيل.
-- =====================================================================

-- توحيد إجابة الفراغ: توحيد عربي + حذف الترقيم + حذف «ال» في أول الكلمة
create or replace function itqan.norm_blank(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(itqan.norm_ar(p), '[[:punct:]«»؟،؛…]', ' ', 'g'),
      '(^|\s)ال(\S{2,})', '\1\2', 'g'),
    '\s+', ' ', 'g'));
$$;

-- بدائل الإجابة المقبولة: النص كاملاً + كل جزء مفصول بـ ( ) / | ، ; أو كلمة «أو»
create or replace function itqan.blank_variants(p text)
returns setof text language sql immutable set search_path = '' as $$
  select distinct v from (
    select itqan.norm_blank(p) v
    union all
    select itqan.norm_blank(y)
    from regexp_split_to_table(itqan.norm_ar(p), '[()/|،,؛;]') x,
         regexp_split_to_table(btrim(x), '(^|\s)او(\s|$)') y
  ) t where v <> '';
$$;

create or replace function itqan.blank_ok(p_accepted jsonb, p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select nullif(itqan.norm_blank(p_text), '') is not null and exists (
    select 1
    from jsonb_array_elements_text(case when jsonb_typeof(p_accepted) = 'array' then p_accepted else '[]'::jsonb end) x,
         itqan.blank_variants(x) v
    where v = itqan.norm_blank(p_text));
$$;

-- تصحيح سؤال واحد (059) — تغيّر فرع fill_blank فقط
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
    ok := txt is not null and itqan.blank_ok(q -> 'accepted_answers', txt);
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

-- إعادة تصحيح «أكمل الفراغ» في تسليمات اختبار (للموظفين، وفي فرعهم فقط كسياسة تعديل التسليمات)
create or replace function public.itqan_regrade_blanks(p_quiz_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_questions jsonb;
  s record;
  v_new jsonb; v_score numeric; v_total numeric; v_updated int := 0;
  v_branch text := itqan.my_branch();
begin
  if not coalesce(itqan.is_staff(), false) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select case when jsonb_typeof(z.questions) = 'array' then z.questions else '[]'::jsonb end
    into v_questions from public.quizzes z where z.id::text = p_quiz_id;
  if v_questions is null then return jsonb_build_object('ok', false, 'error', 'quiz_not_found'); end if;
  if not exists (select 1 from jsonb_array_elements(v_questions) q where q ->> 'type' = 'fill_blank') then
    return jsonb_build_object('ok', true, 'updated', 0);
  end if;

  for s in select x.id, x.answers_json, x.total_possible_score from public.submissions x
           where x.quiz_id::text = p_quiz_id
             and (v_branch is null or itqan.user_branch(x.student_id::text) = v_branch) loop
    continue when jsonb_typeof(s.answers_json) <> 'array';
    select coalesce(jsonb_agg(
             case when q.v ->> 'type' = 'fill_blank' and not coalesce((a.v ->> 'graded')::boolean, false)
                  then a.v || (itqan.grade_single(q.v, a.v) - 'selected_option' - 'text_answer')
                  else a.v end
             order by a.k), '[]'::jsonb)
      into v_new
    from jsonb_array_elements(s.answers_json) with ordinality a(v, k)
    left join lateral (select x v from jsonb_array_elements(v_questions) x where x ->> 'id' = a.v ->> 'question_id' limit 1) q on true;
    continue when v_new = s.answers_json;
    v_score := (select coalesce(sum(nullif(x ->> 'marks_awarded', '')::numeric), 0) from jsonb_array_elements(v_new) x);
    v_total := coalesce(s.total_possible_score::numeric, 0);
    update public.submissions
       set answers_json = v_new, score = v_score,
           percentage = case when v_total > 0 then round(v_score / v_total * 100) else 0 end
     where id = s.id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_updated);
end $$;

revoke all on function public.itqan_regrade_blanks(text) from public;
grant execute on function public.itqan_regrade_blanks(text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 070: تصحيح «أكمل الفراغ» بمرونة وإعادة التصحيح' as result;
