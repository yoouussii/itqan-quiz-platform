-- =====================================================================
-- منصة إتقان: 014 — الحد من الغش
--  - إعدادات للاختبار: خلط ترتيب الأسئلة، خلط الاختيارات، وضع ملء الشاشة.
--  - سجل خروج الطالب من صفحة الاختبار (عدد المرات والمدة) يُحفظ مع التسليم ويراه المعلم.
--
-- يتطلب 004 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

alter table public.quizzes add column if not exists shuffle_questions boolean not null default false;
alter table public.quizzes add column if not exists shuffle_options boolean not null default false;
alter table public.quizzes add column if not exists require_fullscreen boolean not null default false;

-- { leaves: عدد مرات الخروج، away_seconds: مجموع مدة الغياب، fullscreen_exits: الخروج من ملء الشاشة }
alter table public.submissions add column if not exists integrity jsonb;

-- التسليم مع سجل الخروج: يستدعي itqan_submit_quiz كما هي ثم يحفظ السجل للتسليم الجديد فقط
create or replace function public.itqan_submit_quiz_v2(
  p_quiz_id text, p_answers jsonb, p_time_spent integer, p_client_id text default null, p_integrity jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb;
  v_id text;
  v_clean jsonb;
  v_row jsonb;
  -- رقم صحيح بين 0 و100000 (أي قيمة أخرى تُهمل)
  n_leaves int; n_away int; n_fs int;
begin
  v_res := public.itqan_submit_quiz(p_quiz_id, p_answers, p_time_spent, p_client_id);
  v_id := v_res -> 'submission' ->> 'id';
  if not coalesce((v_res ->> 'ok')::boolean, false) or v_id is null or jsonb_typeof(p_integrity) <> 'object' then
    return v_res;
  end if;

  n_leaves := case when jsonb_typeof(p_integrity -> 'leaves') = 'number' then least(greatest((p_integrity ->> 'leaves')::numeric, 0), 100000)::int end;
  n_away := case when jsonb_typeof(p_integrity -> 'away_seconds') = 'number' then least(greatest((p_integrity ->> 'away_seconds')::numeric, 0), 100000)::int end;
  n_fs := case when jsonb_typeof(p_integrity -> 'fullscreen_exits') = 'number' then least(greatest((p_integrity ->> 'fullscreen_exits')::numeric, 0), 100000)::int end;
  v_clean := jsonb_strip_nulls(jsonb_build_object('leaves', n_leaves, 'away_seconds', n_away, 'fullscreen_exits', n_fs));

  -- تسليم هذا الطالب، ولمرة واحدة (إعادة الإرسال بعد انقطاع الشبكة لا تغيّر السجل)
  update public.submissions s set integrity = v_clean
  where s.id::text = v_id and s.student_id::text = itqan.uid() and s.integrity is null
  returning to_jsonb(s) into v_row;

  if v_row is not null then
    v_res := jsonb_set(v_res, '{submission}', v_row);
  end if;
  return v_res;
end $$;

revoke execute on function public.itqan_submit_quiz_v2(text, jsonb, integer, text, jsonb) from public;
grant execute on function public.itqan_submit_quiz_v2(text, jsonb, integer, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 014: الحد من الغش (خلط الأسئلة والاختيارات، ملء الشاشة، سجل الخروج)' as result;
