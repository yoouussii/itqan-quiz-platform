-- =====================================================================
-- منصة إتقان: 082 — «خطأ فعلاً» في تبويب «أكمل الفراغ» يُحفظ على الخادم
--  كان الإخفاء يُحفظ على الجهاز فقط، فما يُراجَع من الجوال يعود ظاهراً على الحاسب.
--  الآن: تُعلَّم الإجابات المطابقة في كل تسليمات الاختبار بأنها «راجعها المعلم» (graded = true)
--  مع بقاء درجتها صفراً، فتختفي من قائمة المراجعة على كل الأجهزة، ولا تغيّرها إعادة التصحيح.
--
-- يتطلب 070. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function public.itqan_dismiss_blank(p_quiz_id text, p_question_id text, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_quiz public.quizzes;
  v_norm text := itqan.norm_blank(coalesce(p_answer, ''));
  v_branch text := itqan.my_branch();
  v_updated int := 0;
  s record;
  v_new jsonb;
begin
  if not coalesce(itqan.is_staff(), false) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_norm = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select * into v_quiz from public.quizzes where id::text = p_quiz_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'quiz_not_found'); end if;
  if not (v_quiz.teacher_id::text = itqan.uid() or to_jsonb(v_quiz) ->> 'created_by' = itqan.uid() or itqan.has_perm('can_grade_essays')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  for s in select x.id, x.answers_json from public.submissions x
           where x.quiz_id::text = p_quiz_id and jsonb_typeof(x.answers_json) = 'array'
             and (v_branch is null or itqan.user_branch(x.student_id::text) = v_branch) loop
    select coalesce(jsonb_agg(
             case when a.v ->> 'question_id' = p_question_id
                       and not coalesce((a.v ->> 'is_correct')::boolean, false)
                       and not coalesce((a.v ->> 'graded')::boolean, false)
                       and itqan.norm_blank(coalesce(a.v ->> 'text_answer', '')) = v_norm
                  then a.v || jsonb_build_object('graded', true, 'marks_awarded', 0)
                  else a.v end
             order by a.k), '[]'::jsonb)
      into v_new
    from jsonb_array_elements(s.answers_json) with ordinality a(v, k);
    continue when v_new = s.answers_json;
    update public.submissions set answers_json = v_new where id = s.id;
    v_updated := v_updated + 1;
  end loop;
  return jsonb_build_object('ok', true, 'updated', v_updated);
end $$;

revoke all on function public.itqan_dismiss_blank(text, text, text) from public;
grant execute on function public.itqan_dismiss_blank(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 082: «خطأ فعلاً» في «أكمل الفراغ» يُحفظ على الخادم' as result;
